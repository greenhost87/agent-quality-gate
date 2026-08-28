import { describe, expect, test } from 'bun:test';
import { chdir } from 'node:process';
import { join, resolve } from 'node:path';
import { SQL, file } from 'bun';
import { getRequiredEnv } from '@/system/config/environment';
import {
  countRuntimeItems,
  insertRuntimeItem,
  insertRuntimeItemInTransaction,
  insertRuntimeItemThenFail,
  listRuntimeItems,
  listRuntimeItemsByIds,
} from '../fixture/system/database/runtime/runtime.dao.ts';
import { useIsolatedTestDatabase } from '../payload/tests/setup/testDatabase.ts';

const presetRoot = resolve(import.meta.dir, '..');
chdir(presetRoot);

const fixturesDirectory = join(import.meta.dir, 'fixtures');
const { runDatabaseMigrations } = await import('../payload/system/database/migrate.ts');

useIsolatedTestDatabase(import.meta.path);

async function listPublicLedgerTables(client: SQL): Promise<string[]> {
  const query = await file(join(fixturesDirectory, 'list-public-ledger-tables.sql')).text();
  const rows = await client.unsafe<{ name: string }[]>(query);
  return rows.map((row) => row.name);
}

describe('database runtime integration', () => {
  test('starts from migrated baseline seed data', async () => {
    const items = await listRuntimeItems();
    expect(items.map((item) => item.name)).toEqual(['seed']);
    expect(await listRuntimeItemsByIds([1])).toEqual([{ id: 1, name: 'seed' }]);
  });

  test('creates schema_migrations when pgmigrations is absent', async () => {
    await using client = new SQL(getRequiredEnv('DATABASE_URL'));
    expect(await listPublicLedgerTables(client)).toEqual(['schema_migrations']);
  });

  test('reuses existing pgmigrations instead of creating schema_migrations', async () => {
    await using client = new SQL(getRequiredEnv('DATABASE_URL'));
    const setupSql = await file(
      join(fixturesDirectory, 'replace-schema-migrations-with-pgmigrations.sql'),
    ).text();
    await client.unsafe(setupSql).simple();

    await runDatabaseMigrations();

    expect(await listPublicLedgerTables(client)).toEqual(['pgmigrations']);
    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
  });

  test('treats ledger names without .sql as already applied', async () => {
    await using client = new SQL(getRequiredEnv('DATABASE_URL'));
    const setupSql = await file(
      join(fixturesDirectory, 'strip-sql-extension-from-schema-migrations.sql'),
    ).text();
    await client.unsafe(setupSql).simple();

    await runDatabaseMigrations();

    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
    const names = await client<{ name: string }[]>`SELECT name FROM schema_migrations`;
    expect(names.map((row) => row.name)).toEqual(['000001-runtime']);
  });

  test('isolates clones so earlier mutations do not leak', async () => {
    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
    await insertRuntimeItem('clone-a');
    expect(await countRuntimeItems()).toBe(2);
  });

  test('sees only migrated baseline after a prior test mutated its clone', async () => {
    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
  });

  test('commits transactional writes', async () => {
    await insertRuntimeItemInTransaction('committed');
    const names = (await listRuntimeItems()).map((item) => item.name);
    expect(names).toContain('committed');
  });

  test('rolls back failed transactional writes', async () => {
    const before = await countRuntimeItems();
    await expect(insertRuntimeItemThenFail('rolled-back')).rejects.toThrow('force rollback');
    expect(await countRuntimeItems()).toBe(before);
    const names = (await listRuntimeItems()).map((item) => item.name);
    expect(names).not.toContain('rolled-back');
  });
});
