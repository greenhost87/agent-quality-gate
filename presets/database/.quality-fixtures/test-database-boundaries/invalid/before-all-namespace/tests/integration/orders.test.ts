import * as bunTest from 'bun:test';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';
import { insertOrder, listOrders } from '@/system/database/orders/orders.dao';
useIsolatedTestDatabase(import.meta.path);
bunTest.beforeAll(async () => {
  await insertOrder('seed');
});
bunTest.beforeEach(async () => {
  await insertOrder('each');
});
bunTest.test('lists', async () => {
  await listOrders();
});
