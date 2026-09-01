import { expect, test } from 'bun:test';
import { closeOrder, createOrders, listOrdersByStatus } from '@/system/database/orders/orders.dao';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';

const currentDatabase = useIsolatedTestDatabase(import.meta.path);

test('persists and updates orders through the production DAO', () => {
  const database = currentDatabase();
  createOrders(database, [
    { id: 'order-1', label: 'First' },
    { id: 'order-2', label: 'Second' },
  ]);

  expect(listOrdersByStatus(database, 'open')).toHaveLength(2);
  expect(closeOrder(database, 'order-1')).toBe(true);
  expect(listOrdersByStatus(database, 'closed')).toEqual([
    { id: 'order-1', label: 'First', status: 'closed' },
  ]);
});

test('starts from the migrated template for every test', () => {
  expect(listOrdersByStatus(currentDatabase(), 'open')).toEqual([]);
});
