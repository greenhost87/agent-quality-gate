import { describe, expect, test } from 'bun:test';
import { chdir } from 'node:process';
import { resolve } from 'node:path';
import {
  countRuntimeItems,
  insertRuntimeItem,
  insertRuntimeItemInTransaction,
  insertRuntimeItemThenFail,
  listRuntimeItems,
} from '../fixture/system/database/runtime/runtime.dao.ts';
import { useIsolatedTestDatabase } from '../payload/tests/setup/testDatabase.ts';

const presetRoot = resolve(import.meta.dir, '..');
chdir(presetRoot);

useIsolatedTestDatabase(import.meta.path);

describe('database runtime parallel worker', () => {
  test('starts from migrated baseline seed data in a second file', async () => {
    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
  });

  test('isolates clones so earlier mutations do not leak across tests', async () => {
    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
    await insertRuntimeItem('worker-a');
    expect(await countRuntimeItems()).toBe(2);
  });

  test('sees only migrated baseline after a prior test mutated its clone', async () => {
    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
  });

  test('commits transactional writes in a second worker file', async () => {
    await insertRuntimeItemInTransaction('worker-committed');
    const names = (await listRuntimeItems()).map((item) => item.name);
    expect(names).toContain('worker-committed');
  });

  test('rolls back failed transactional writes in a second worker file', async () => {
    const before = await countRuntimeItems();
    await expect(insertRuntimeItemThenFail('worker-rolled-back')).rejects.toThrow('force rollback');
    expect(await countRuntimeItems()).toBe(before);
    const names = (await listRuntimeItems()).map((item) => item.name);
    expect(names).not.toContain('worker-rolled-back');
  });

  test('reuses the production client after same-name force drop and recreate', async () => {
    expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
    await insertRuntimeItem('reconnect-probe');
    expect(await countRuntimeItems()).toBe(2);
  });
});
