import { expect, test } from 'bun:test';
import { chdir } from 'node:process';
import { resolve } from 'node:path';
import { listRuntimeItems } from '../fixture/system/database/runtime/runtime.dao.ts';
import { useIsolatedTestDatabase } from '../payload/tests/setup/testDatabase.ts';

chdir(resolve(import.meta.dir, '..'));
useIsolatedTestDatabase(import.meta.path);

test('reads migrated data in parallel database file A', async () => {
  expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
});
