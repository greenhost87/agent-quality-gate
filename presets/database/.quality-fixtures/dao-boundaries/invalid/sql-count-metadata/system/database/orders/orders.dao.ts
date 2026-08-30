import { sql } from '@/system/database/connection';

export async function deleteOrder(id: number): Promise<void> {
  const result = await sql<{ readonly count: number }>`
    DELETE FROM orders WHERE id = ${id}
  `;
  if (result.count !== 1) throw new Error('Order not found');
}
