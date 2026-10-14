import { expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  getDatabase,
  getDatabaseGeneration,
} from 'agent-quality-gate/internal/presets/database-sqlite/payload/system/database/connection.ts';
import { useIsolatedTestDatabase } from 'agent-quality-gate/internal/presets/database-sqlite/payload/tests/setup/testDatabase.ts';
import {
  createOrders,
  listOrdersByStatus,
} from 'agent-quality-gate/internal/presets/database-sqlite/examples/system/database/orders/orders.dao.ts';

const currentDatabase = useIsolatedTestDatabase(import.meta.path, {
  migrationsDirectory: join(import.meta.dir, '../migrations'),
});
let previousGeneration = -1;

test('installs a migrated database as the production connection', () => {
  const database = currentDatabase();
  expect(getDatabase()).toBe(database);
  createOrders(database, [{ id: 'order-1', label: 'First' }]);
  expect(listOrdersByStatus(database, 'open')).toEqual([
    { id: 'order-1', label: 'First', status: 'open' },
  ]);
  previousGeneration = getDatabaseGeneration();
});

test('deserializes a clean migrated template before the next test', () => {
  const database = currentDatabase();
  expect(listOrdersByStatus(database, 'open')).toEqual([]);
  expect(getDatabaseGeneration()).toBeGreaterThan(previousGeneration);
});
