import { expect, test } from 'bun:test';
import { chdir } from 'node:process';
import { resolve } from 'node:path';
import {
  insertRuntimeItem,
  listRuntimeItems,
} from '../fixture/system/database/runtime/runtime.dao.ts';
import { useIsolatedTestDatabase } from '../payload/tests/setup/testDatabase.ts';

chdir(resolve(import.meta.dir, '..'));
useIsolatedTestDatabase(import.meta.path);

test('persists data in parallel database file B', async () => {
  await insertRuntimeItem('parallel-b');
  expect((await listRuntimeItems()).map((item) => item.name)).toEqual(['seed', 'parallel-b']);
});
