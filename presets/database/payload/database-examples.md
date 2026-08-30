# Database preset examples

Agent-facing copy targets for the `database` preset. Sources under `examples/` are linted and typechecked by the preset pack (baseline + database oxlint rules). Managed runtime files stay in `payload/` (`connection.ts`, `migrate.ts`, `testDatabase*.ts`).

After verify in a target project, read this file at `.aqg/database/database-examples.md`.

## Rules of thumb

- `sql` from `@/system/database/connection` is already a lazy Proxy — call it directly in `*.dao.ts`.
- Build dynamic filtering and sorting with tagged SQL fragments. Bun SQL `.unsafe()` is reserved for managed database infrastructure.
- Define empty-list semantics in the DAO before calling `sql(values)` / `tx(values)`; return an empty result or no-op for match-none semantics, or omit the clause when empty means no filter.
- Cache/lifecycle side effects belong in helpers such as `system/database/caches.ts`, keyed by `getDatabaseGeneration()`.
- Outside `system/database/`, import only `closeDatabase` from connection (app bootstrap / shutdown).
- Integration tests observe production-reachable named DAO functions only.
- Optional DAO reads use `rows[0] ?? null`; mapped reads inspect and map the first row inline.
- `UPDATE` / `DELETE` not-found checks use `RETURNING` plus `rows.length === 0` — no `dao-result.ts` / `map-first-row.ts` modules or Bun SQL `count` metadata.

## Shared cache helper

Copy to `system/database/caches.ts`.

- Use when several DAOs share in-process memo that must drop on pool recycle.
- Import `getDatabaseGeneration` only from modules under `system/database/`.
- Never invent `system/database/client.ts`, `createDatabaseAccessor`, or `getDatabase()` wrappers around `sql`.

```ts
import { getDatabaseGeneration } from '@/system/database/connection';

const orderListCache = new Map<string, readonly { id: number; status: string }[]>();

let boundGeneration = -1;

/** Drop shared entries when the active SQL client generation changes. */
export function syncCachesToDatabaseGeneration(): void {
  const generation = getDatabaseGeneration();
  if (boundGeneration === generation) {
    return;
  }
  boundGeneration = generation;
  orderListCache.clear();
}

export function readCachedOrderList(
  key: string,
): readonly { id: number; status: string }[] | undefined {
  syncCachesToDatabaseGeneration();
  return orderListCache.get(key);
}

export function writeCachedOrderList(
  key: string,
  value: readonly { id: number; status: string }[],
): void {
  syncCachesToDatabaseGeneration();
  orderListCache.set(key, value);
}

export function invalidateOrderListCache(): void {
  orderListCache.clear();
}
```

## DAO module

Copy to `system/database/<domain>/<name>.dao.ts`.

- Exactly one domain segment under `system/database/`.
- Import lazy `sql` from `@/system/database/connection` and call it directly.
- Build dynamic filtering and sorting with tagged SQL fragments; never use `.unsafe()` outside managed database infrastructure.
- Before passing a dynamic value list to `sql(values)` / `tx(values)`, handle empty input explicitly: return an empty result or no-op for match-none semantics, or omit the clause when empty means no filter.
- Export only named function declarations and types — no classes, default exports, or object bags.
- For optional reads, use `rows[0] ?? null`; map the first row inline when needed.
- For `UPDATE` / `DELETE` not-found checks, use `RETURNING` and `rows.length === 0` — no result-helper modules or Bun-specific `count` metadata.
- Baseline gate still applies: keep modules small, avoid banned patterns, no `oxlint-disable` escapes.

```ts
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
  if (ids.length === 0) {
    return [];
  }
  return await sql<Order[]>`
    SELECT id, status
    FROM orders
    WHERE id IN ${sql(ids)}
    ORDER BY id
  `;
}

export async function searchOrders(query: SearchOrdersQuery): Promise<Order[]> {
  const trimmedStatus = query.statusQuery?.trim();
  const statusPattern = trimmedStatus ? `%${trimmedStatus}%` : null;
  const statusFilter = statusPattern === null ? sql`` : sql`WHERE status ILIKE ${statusPattern}`;
  const orderBy = query.sort === 'status' ? sql`status ASC, id ASC` : sql`id ASC`;

  return await sql<Order[]>`
    SELECT id, status
    FROM orders
    ${statusFilter}
    ORDER BY ${orderBy}
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

export async function updateOrderStatus(id: number, status: string): Promise<void> {
  const rows = await sql<{ id: number }[]>`
    UPDATE orders
    SET status = ${status}
    WHERE id = ${id}
    RETURNING id
  `;
  if (rows.length === 0) {
    throw new Error(`Order ${id} was not found`);
  }
  invalidateOrderListCache();
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

export type SearchOrdersQuery = {
  readonly statusQuery?: string;
  readonly sort?: 'id' | 'status';
};
```

## Database integration test

Copy to `tests/<area>.integration.test.ts`.

- Run under `tests/setup/testDatabase.bootstrap.ts` so workers receive `TEST_DATABASE_SHARED_URL`.
- Import named DAO operations only — never an `ordersDao` facade.
- Do not import `sql`, Bun.sql, or testcontainers from the test file.

```ts
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
```

