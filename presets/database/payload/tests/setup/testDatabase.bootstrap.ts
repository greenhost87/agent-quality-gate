// Managed by agent-quality-gate. Do not edit; changes are overwritten on verify.

import { join } from 'node:path';
import { SQL, mmap, spawn } from 'bun';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';
import { createEnv, getOptionalEnv, getRequiredEnv, setEnv } from '@/system/config/environment';
import { runDatabaseMigrations } from '@/system/database/migrate';

const TERMINATE_DATABASE_CONNECTIONS_SQL = new TextDecoder().decode(
  mmap(join(import.meta.dir, 'fixtures/terminate-database-connections.sql')),
);
const TEST_DB_IMAGE = 'postgres:19beta2-alpine3.24';
const TEST_DB_USER = 'test_database_user';
const TEST_DB_PASSWORD = 'test_database_password';
const TEST_DB_BOOTSTRAP_NAME = 'test_database_bootstrap';
const TEST_DB_TEMPLATE_NAME = 'test_database_template';
const SHARED_HOST_ENV = 'AQG_TEST_DATABASE_HOST';
const SHARED_PORT_ENV = 'AQG_TEST_DATABASE_PORT';
const SHARED_USER_ENV = 'AQG_TEST_DATABASE_USER';
const SHARED_PASSWORD_ENV = 'AQG_TEST_DATABASE_PASSWORD';

export const APPLICATION_DATABASE_NAME = `test_database_app_${getOptionalEnv('BUN_TEST_WORKER_ID') ?? '0'}`;

function createConnectionUriFromParts(
  host: string,
  port: string,
  user: string,
  password: string,
  databaseName: string,
): string {
  const url = new URL('postgres://localhost');
  url.hostname = host;
  url.port = port;
  url.username = user;
  url.password = password;
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function getSharedServerConnectionParts(): {
  host: string;
  port: string;
  user: string;
  password: string;
} {
  return {
    host: getRequiredEnv(SHARED_HOST_ENV),
    port: getRequiredEnv(SHARED_PORT_ENV),
    user: getRequiredEnv(SHARED_USER_ENV),
    password: getRequiredEnv(SHARED_PASSWORD_ENV),
  };
}

function createConnectionUri(databaseName: string): string {
  const parts = getSharedServerConnectionParts();
  return createConnectionUriFromParts(
    parts.host,
    parts.port,
    parts.user,
    parts.password,
    databaseName,
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function withAdminClient(callback: (client: SQL) => Promise<void>): Promise<void> {
  await using client = new SQL(createConnectionUri('postgres'));
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
      `CREATE DATABASE ${quoteIdentifier(APPLICATION_DATABASE_NAME)} TEMPLATE ${quoteIdentifier(TEST_DB_TEMPLATE_NAME)}`,
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
  setEnv('DATABASE_URL', createConnectionUri(APPLICATION_DATABASE_NAME));
}

async function prepareSharedTemplate(container: StartedPostgreSqlContainer): Promise<void> {
  setEnv(SHARED_HOST_ENV, container.getHost());
  setEnv(SHARED_PORT_ENV, String(container.getMappedPort(5432)));
  setEnv(SHARED_USER_ENV, TEST_DB_USER);
  setEnv(SHARED_PASSWORD_ENV, TEST_DB_PASSWORD);

  setEnv('DATABASE_URL', createConnectionUri(TEST_DB_BOOTSTRAP_NAME));
  try {
    await runDatabaseMigrations();
    await container.snapshot(TEST_DB_TEMPLATE_NAME);
  } finally {
    setEnv('DATABASE_URL', undefined);
  }
}

async function startSharedTestDatabaseContainer(): Promise<StartedPostgreSqlContainer> {
  console.log('[Test Mode] Starting PostgreSQL container with Testcontainers...');
  const container = await new PostgreSqlContainer(TEST_DB_IMAGE)
    .withAutoCleanup(true)
    .withDatabase(TEST_DB_BOOTSTRAP_NAME)
    .withUsername(TEST_DB_USER)
    .withPassword(TEST_DB_PASSWORD)
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
        [SHARED_HOST_ENV]: container.getHost(),
        [SHARED_PORT_ENV]: String(container.getMappedPort(5432)),
        [SHARED_USER_ENV]: TEST_DB_USER,
        [SHARED_PASSWORD_ENV]: TEST_DB_PASSWORD,
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
