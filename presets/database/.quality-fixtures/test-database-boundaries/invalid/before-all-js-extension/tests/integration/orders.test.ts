import { beforeAll } from 'bun:test';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase.js';
import { insertOrder } from '@/system/database/orders/orders.dao.js';
useIsolatedTestDatabase(import.meta.path);
beforeAll(async () => {
  await insertOrder('seed');
});
