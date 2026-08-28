/**
 * Database integration test shape for target projects.
 *
 * Run only under the parent runner:
 *   bun tests/setup/testDatabase.bootstrap.ts bun test --parallel --timeout 120000 tests/*.integration.test.ts
 *
 * Workers expect `TEST_DATABASE_SHARED_URL` from the parent. Arrange/observe through named
 * production DAO functions only — no `sql`, testcontainers, or test-only DAOs.
 */
import { describe, expect, test } from 'bun:test';
import {
  createOrder,
  createOrderThenFail,
  getOrderById,
  listOrders,
} from '@/system/database/orders/orders.dao';
import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';

useIsolatedTestDatabase(import.meta.path);

describe('orders database integration', () => {
  test('starts from migrated seed data', async () => {
    const orders = await listOrders();

    expect(orders).toEqual([{ id: 1, status: 'pending' }]);
  });

  test('persists an order', async () => {
    const created = await createOrder({ status: 'confirmed' });

    expect(await getOrderById(created.id)).toEqual({
      id: created.id,
      status: 'confirmed',
    });
  });

  test('does not leak changes from another test', async () => {
    expect(await listOrders()).toEqual([{ id: 1, status: 'pending' }]);
  });

  test('rolls back a failed transaction', async () => {
    const before = await listOrders();

    const outcome = await createOrderThenFail({ status: 'confirmed' }).then(
      () => 'committed',
      () => 'rolled-back',
    );
    expect(outcome).toBe('rolled-back');

    expect(await listOrders()).toEqual(before);
  });
});
