import { join } from 'node:path';
import { SQL, file, spawn } from 'bun';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';
import { createEnv, getOptionalEnv, getRequiredEnv, setEnv } from '@/system/config/environment';
import { runDatabaseMigrations } from '@/system/database/migrate';

const TERMINATE_DATABASE_CONNECTIONS_SQL = await file(
  join(import.meta.dir, 'fixtures/terminate-database-connections.sql'),
).text();

const TEST_DATABASE = {
  image: 'postgres:19beta2-alpine3.24',
  user: 'test_database_user',
  password: 'test_database_password',
  bootstrapName: 'test_database_bootstrap',
  templateName: 'test_database_template',
  sharedUrlEnv: 'TEST_DATABASE_SHARED_URL',
} as const;

export const APPLICATION_DATABASE_NAME = `test_database_app_${getOptionalEnv('BUN_TEST_WORKER_ID') ?? '0'}`;

function connectionUri(
  databaseName: string,
  baseUrl = getRequiredEnv(TEST_DATABASE.sharedUrlEnv),
): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function sharedBaseUrl(container: StartedPostgreSqlContainer): string {
  const url = new URL('postgres://localhost');
  url.hostname = container.getHost();
  url.port = String(container.getMappedPort(5432));
  url.username = TEST_DATABASE.user;
  url.password = TEST_DATABASE.password;
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function withAdminClient(callback: (client: SQL) => Promise<void>): Promise<void> {
  await using client = new SQL(connectionUri('postgres'));
  await callback(client);
}

async function terminateDatabaseConnections(client: SQL, databaseName: string): Promise<void> {
  await client.unsafe(TERMINATE_DATABASE_CONNECTIONS_SQL, [databaseName]);
}

async function dropDatabase(client: SQL, databaseName: string): Promise<void> {
  await client.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
}

export async function recreateApplicationDatabaseFromTemplate(): Promise<void> {
  await withAdminClient(async (client) => {
    await terminateDatabaseConnections(client, APPLICATION_DATABASE_NAME);
    await dropDatabase(client, APPLICATION_DATABASE_NAME);
    await client.unsafe(
      `CREATE DATABASE ${quoteIdentifier(APPLICATION_DATABASE_NAME)} TEMPLATE ${quoteIdentifier(TEST_DATABASE.templateName)}`,
    );
  });
}

export async function dropApplicationDatabase(): Promise<void> {
  await withAdminClient(async (client) => {
    await terminateDatabaseConnections(client, APPLICATION_DATABASE_NAME);
    await dropDatabase(client, APPLICATION_DATABASE_NAME);
  });
}

export async function ensureWorkerApplicationDatabase(): Promise<void> {
  await recreateApplicationDatabaseFromTemplate();
  setEnv('DATABASE_URL', connectionUri(APPLICATION_DATABASE_NAME));
}

async function prepareSharedTemplate(container: StartedPostgreSqlContainer): Promise<void> {
  const baseUrl = sharedBaseUrl(container);
  setEnv(TEST_DATABASE.sharedUrlEnv, baseUrl);

  setEnv('DATABASE_URL', connectionUri(TEST_DATABASE.bootstrapName, baseUrl));
  try {
    await runDatabaseMigrations();
    await container.snapshot(TEST_DATABASE.templateName);
  } finally {
    setEnv('DATABASE_URL', undefined);
  }
}

async function startSharedTestDatabaseContainer(): Promise<StartedPostgreSqlContainer> {
  console.log('[Test Mode] Starting PostgreSQL container with Testcontainers...');
  const container = await new PostgreSqlContainer(TEST_DATABASE.image)
    .withAutoCleanup(true)
    .withDatabase(TEST_DATABASE.bootstrapName)
    .withUsername(TEST_DATABASE.user)
    .withPassword(TEST_DATABASE.password)
    .withWaitStrategy(Wait.forHealthCheck())
    .start();
  console.log('[Test Mode] PostgreSQL container started via Testcontainers');
  await prepareSharedTemplate(container);
  return container;
}

async function runParentTestRunner(command: string[]): Promise<number> {
  const container = await startSharedTestDatabaseContainer();
  try {
    const child = spawn({
      cmd: command,
      env: createEnv({
        [TEST_DATABASE.sharedUrlEnv]: sharedBaseUrl(container),
      }),
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const forwardSignal = (signal: NodeJS.Signals): void => {
      try {
        child.kill(signal);
      } catch {
        // Child may have already exited.
      }
    };
    process.on('SIGINT', () => {
      forwardSignal('SIGINT');
    });
    process.on('SIGTERM', () => {
      forwardSignal('SIGTERM');
    });

    return await child.exited;
  } finally {
    console.log('[Test Mode] Stopping PostgreSQL container...');
    await container.stop();
    console.log('[Test Mode] PostgreSQL container stopped');
  }
}

if (import.meta.main) {
  const command = process.argv.slice(2);
  if (command.length === 0) {
    console.error('Usage: testDatabase.bootstrap.ts <command> [...args]');
    process.exit(1);
  }
  process.exit(await runParentTestRunner(command));
}
