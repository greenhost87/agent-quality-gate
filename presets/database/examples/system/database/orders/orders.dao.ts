/**
 * Canonical DAO shape for target projects.
 *
 * Path: `system/database/<domain>/<name>.dao.ts` (exactly one domain segment).
 * Call managed `sql` directly — never wrap it for cache or lifecycle side effects.
 */
import { sql } from '@/system/database/connection';
import {
  invalidateOrderListCache,
  readCachedOrderList,
  writeCachedOrderList,
} from '@/system/database/caches';

const ORDER_LIST_CACHE_KEY = 'all';

export async function listOrders(): Promise<Order[]> {
  const cached = readCachedOrderList(ORDER_LIST_CACHE_KEY);
  if (cached !== undefined) {
    return [...cached];
  }

  const rows = await sql<Order[]>`
    SELECT id, status
    FROM orders
    ORDER BY id
  `;
  writeCachedOrderList(ORDER_LIST_CACHE_KEY, rows);
  return rows;
}

export async function getOrderById(id: number): Promise<Order | null> {
  const rows = await sql<Order[]>`
    SELECT id, status
    FROM orders
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listOrdersByIds(ids: number[]): Promise<Order[]> {
  return await sql<Order[]>`
    SELECT id, status
    FROM orders
    WHERE id IN ${sql(ids)}
    ORDER BY id
  `;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const rows = await sql<Order[]>`
    INSERT INTO orders (status)
    VALUES (${input.status})
    RETURNING id, status
  `;
  if (rows.length === 0) {
    throw new Error('Failed to create order');
  }
  invalidateOrderListCache();
  return rows[0];
}

export async function deleteOrder(id: number): Promise<void> {
  const rows = await sql<{ id: number }[]>`
    DELETE FROM orders
    WHERE id = ${id}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error(`Order ${id} was not found`);
  }
  invalidateOrderListCache();
}

export async function createOrderThenFail(input: CreateOrderInput): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO orders (status)
      VALUES (${input.status})
    `;
    throw new Error('force rollback');
  });
}

export type Order = {
  id: number;
  status: string;
};

export type CreateOrderInput = {
  status: string;
};
