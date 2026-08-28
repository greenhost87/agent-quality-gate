import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SQL, file } from 'bun';
import { getRequiredEnv, isNodeEnvironment } from '@/system/config/environment';

function migrationIdentity(name: string): string {
  return name.endsWith('.sql') ? name.slice(0, -'.sql'.length) : name;
}

async function listSqlMigrationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function publicRelationExists(client: SQL, relation: string): Promise<boolean> {
  const rows = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS class
      INNER JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
      WHERE
        namespace.nspname = 'public'
        AND class.relname = ${relation}
        AND class.relkind = 'r'
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function resolveMigrationLedger(client: SQL): Promise<MigrationLedger> {
  if (await publicRelationExists(client, 'pgmigrations')) {
    return 'pgmigrations';
  }

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id serial4 NOT NULL,
      "name" varchar(255) NOT NULL,
      run_on timestamp NOT NULL,
      CONSTRAINT schema_migrations_id_not_null NOT NULL id,
      CONSTRAINT schema_migrations_name_not_null NOT NULL name,
      CONSTRAINT schema_migrations_run_on_not_null NOT NULL run_on,
      CONSTRAINT schema_migrations_pkey PRIMARY KEY (id)
    )
  `);
  return 'schema_migrations';
}

async function listAppliedMigrationNames(
  client: SQL,
  ledger: MigrationLedger,
): Promise<Set<string>> {
  const appliedRows =
    ledger === 'pgmigrations'
      ? await client<{ name: string }[]>`SELECT name FROM pgmigrations`
      : await client<{ name: string }[]>`SELECT name FROM schema_migrations`;
  return new Set(appliedRows.map((row) => migrationIdentity(row.name)));
}

async function recordAppliedMigration(
  tx: SQL,
  ledger: MigrationLedger,
  fileName: string,
): Promise<void> {
  if (ledger === 'pgmigrations') {
    await tx`INSERT INTO pgmigrations (name, run_on) VALUES (${fileName}, NOW())`;
    return;
  }
  await tx`INSERT INTO schema_migrations (name, run_on) VALUES (${fileName}, NOW())`;
}

export async function runDatabaseMigrations(dir = 'migrations'): Promise<void> {
  const migrationsDirectory = resolve(process.cwd(), dir);
  let files: string[];
  try {
    files = await listSqlMigrationFiles(migrationsDirectory);
  } catch {
    throw new Error(`Migrations directory not found at: ${migrationsDirectory}`);
  }

  await using client = new SQL(getRequiredEnv('DATABASE_URL'));
  const ledger = await resolveMigrationLedger(client);
  const applied = await listAppliedMigrationNames(client, ledger);
  const log = isNodeEnvironment('test')
    ? () => {}
    : (message: string) => {
        console.log('%s', message);
      };

  for (const fileName of files) {
    if (applied.has(migrationIdentity(fileName))) {
      continue;
    }

    const sqlText = await file(join(migrationsDirectory, fileName)).text();
    await client.begin(async (tx) => {
      await tx.unsafe(sqlText).simple();
      await recordAppliedMigration(tx, ledger, fileName);
    });
    log(`applied ${fileName}`);
  }
}

export const migrationLedgers = ['pgmigrations', 'schema_migrations'] as const;

export type MigrationLedger = (typeof migrationLedgers)[number];
