import { sql } from '@/system/database/connection';

export async function listOrders(): Promise<unknown[]> {
  return await sql.unsafe('SELECT id FROM orders');
}
