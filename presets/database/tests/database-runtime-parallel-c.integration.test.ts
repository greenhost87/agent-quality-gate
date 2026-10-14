import { expect, test } from 'bun:test';
import { chdir } from 'node:process';
import { resolve } from 'node:path';
import {
  insertRuntimeItemInTransaction,
  listRuntimeItems,
} from 'agent-quality-gate/internal/presets/database/fixture/system/database/runtime/runtime.dao.ts';
import { useIsolatedTestDatabase } from 'agent-quality-gate/internal/presets/database/payload/tests/setup/testDatabase.ts';

chdir(resolve(import.meta.dir, '..'));
useIsolatedTestDatabase(import.meta.path);

test('commits a transaction in parallel database file C', async () => {
  await insertRuntimeItemInTransaction('parallel-c');
  expect((await listRuntimeItems()).map((item) => item.name)).toEqual(['seed', 'parallel-c']);
});
