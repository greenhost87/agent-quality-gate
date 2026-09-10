import { sql } from '@/system/database/connection';

export async function listOrders(ids: readonly number[]): Promise<void> {
  const select = sql`id, status`;
  const idList = ids.length === 0 ? null : sql(ids);
  const tx = sql.begin;
  if (idList === null) {
    return;
  }
  await tx(async () => {
    await sql`SELECT ${select} FROM orders WHERE id IN ${idList}`;
  });
}
