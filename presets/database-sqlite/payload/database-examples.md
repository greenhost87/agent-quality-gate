# database-sqlite preset examples

Agent-facing examples for the `database-sqlite` preset. Managed runtime files are installed under `.aqg/database-sqlite/`; use the deterministic sync helper instead of inventing copy paths.

## Bun references

- [SQLite runtime documentation](https://bun.com/docs/runtime/sqlite)
- [Bun test lifecycle hooks](https://bun.com/docs/test/lifecycle)

The managed test hook creates one migrated `:memory:` template, snapshots it with `database.serialize()`, and creates a fresh database before every test with `Database.deserialize()`. The official Bun SQLite API documents `strict`, prepared statements, transactions, serialization, and explicit close behavior.

## DAO module

Copy to `system/database/<domain>/<name>.dao.ts`.

- Inject `Database` explicitly; import `bun:sqlite` as type-only outside managed infrastructure.
- `Database#query` caches prepared statements. Named parameters are checked because the managed connection uses `strict: true`.
- Use `Database#transaction` for atomic multi-statement operations.

```ts
import type { Database } from 'bun:sqlite';

export const ORDER_STATUSES = ['open', 'closed'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Order = {
  id: string;
  label: string;
  status: OrderStatus;
};

export type NewOrder = {
  id: string;
  label: string;
};

export function createOrders(database: Database, orders: readonly NewOrder[]): void {
  const insert = database.query(
    'INSERT INTO orders (id, label, status) VALUES ($id, $label, $status)',
  );
  const insertAll = database.transaction((values: readonly NewOrder[]) => {
    for (const order of values) {
      insert.run({ id: order.id, label: order.label, status: 'open' });
    }
  });
  insertAll(orders);
}

export function listOrdersByStatus(database: Database, status: OrderStatus): Order[] {
  return database
    .query<Order, { status: OrderStatus }>(
      'SELECT id, label, status FROM orders WHERE status = $status ORDER BY id',
    )
    .all({ status });
}

export function closeOrder(database: Database, id: string): boolean {
  const result = database.query("UPDATE orders SET status = 'closed' WHERE id = $id").run({ id });
  return result.changes > 0;
}
```

## Database integration test

Copy to `tests/<area>.database.integration.test.ts`.

- Call `useIsolatedTestDatabase` at module scope and obtain the current database only inside tests.
- Each test receives a fresh in-memory clone of the migrated template through `serialize` / `deserialize`.
- Do not use `test.concurrent`, `describe.concurrent`, or `bun test --concurrent` with the process-global production connection.

```ts
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
```

