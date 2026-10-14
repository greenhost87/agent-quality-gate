import { expect, test } from 'bun:test';
import { chdir } from 'node:process';
import { resolve } from 'node:path';
import {
  insertRuntimeItemThenFail,
  listRuntimeItems,
} from 'agent-quality-gate/internal/presets/database/fixture/system/database/runtime/runtime.dao.ts';
import { useIsolatedTestDatabase } from 'agent-quality-gate/internal/presets/database/payload/tests/setup/testDatabase.ts';

chdir(resolve(import.meta.dir, '..'));
useIsolatedTestDatabase(import.meta.path);

test('rolls back a transaction in parallel database file D', async () => {
  await expect(insertRuntimeItemThenFail('parallel-d')).rejects.toThrow('force rollback');
  expect(await listRuntimeItems()).toEqual([{ id: 1, name: 'seed' }]);
});
