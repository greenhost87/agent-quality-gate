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
