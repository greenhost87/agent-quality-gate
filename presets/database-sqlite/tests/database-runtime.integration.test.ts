import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { getDatabase, getDatabaseGeneration } from '../payload/system/database/connection.ts';
import { useIsolatedTestDatabase } from '../payload/tests/setup/testDatabase.ts';

const currentDatabase = useIsolatedTestDatabase(import.meta.path, {
  migrationsDirectory: join(import.meta.dir, '../migrations'),
});
let previousGeneration = -1;

test('installs a migrated database as the production connection', () => {
  const database = currentDatabase();
  expect(getDatabase()).toBe(database);
  database
    .query('INSERT INTO orders (id, label, status) VALUES (?, ?, ?)')
    .run('order-1', 'First', 'open');
  expect(database.query('SELECT label FROM orders WHERE id = ?').get('order-1')).toEqual({
    label: 'First',
  });
  expect(
    database
      .query(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`)
      .get('orders_status_idx'),
  ).toEqual({ name: 'orders_status_idx' });
  previousGeneration = getDatabaseGeneration();
});

test('deserializes a clean migrated template before the next test', () => {
  const database = currentDatabase();
  expect(database.query('SELECT COUNT(*) AS count FROM orders').get()).toEqual({ count: 0 });
  expect(getDatabaseGeneration()).toBeGreaterThan(previousGeneration);
});
