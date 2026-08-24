import { beforeAll as setupAll, beforeEach, test } from 'bun:test';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';
import { insertOrder, listOrders } from '@/system/database/orders/orders.dao';
useIsolatedTestDatabase(import.meta.path);
setupAll(async () => {
  await insertOrder('seed');
});
beforeEach(async () => {
  await insertOrder('each');
});
test('lists', async () => {
  await listOrders();
});
