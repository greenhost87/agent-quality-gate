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
  deleteOrder,
  getOrderById,
  listOrders,
  listOrdersByIds,
  searchOrders,
  updateOrderStatus,
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

  test('handles an empty SQL value list before building the query', async () => {
    expect(await listOrdersByIds([])).toEqual([]);
  });

  test('deletes an order', async () => {
    const created = await createOrder({ status: 'to-delete' });

    await deleteOrder(created.id);

    expect(await getOrderById(created.id)).toBeNull();
  });

  test('updates an order', async () => {
    const created = await createOrder({ status: 'before-update' });

    await updateOrderStatus(created.id, 'after-update');

    expect(await getOrderById(created.id)).toEqual({ id: created.id, status: 'after-update' });
  });

  test('filters and sorts orders with SQL fragments', async () => {
    await createOrder({ status: 'review-z' });
    await createOrder({ status: 'review-a' });

    const orders = await searchOrders({ statusQuery: 'review', sort: 'status' });

    expect(orders.map((order) => order.status)).toEqual(['review-a', 'review-z']);
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
