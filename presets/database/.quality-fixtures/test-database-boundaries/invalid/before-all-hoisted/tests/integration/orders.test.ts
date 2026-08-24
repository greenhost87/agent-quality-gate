import { beforeAll } from 'bun:test';
beforeAll(async () => {
  await insertOrder('seed');
});
import { insertOrder } from '@/system/database/orders/orders.dao';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';
useIsolatedTestDatabase(import.meta.path);
