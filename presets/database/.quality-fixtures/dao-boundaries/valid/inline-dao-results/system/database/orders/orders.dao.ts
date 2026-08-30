import { sql } from '@/system/database/connection';

export async function getOrder(id: number): Promise<Order | null> {
  const rows = await sql<Order[]>`SELECT id, status FROM orders WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function countOrders(): Promise<number> {
  const rows = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM orders`;
  return rows[0]?.count ?? 0;
}

export async function deleteOrder(id: number): Promise<void> {
  const rows = await sql<{ id: number }[]>`
    DELETE FROM orders WHERE id = ${id} RETURNING id
  `;
  if (rows.length === 0) throw new Error('Order not found');
}

type Order = { id: number; status: string };
