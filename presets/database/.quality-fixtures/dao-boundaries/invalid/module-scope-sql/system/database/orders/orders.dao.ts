import { sql } from '@/system/database/connection';

const MODULE_SELECT = sql`id`;
const MODULE_IDS = sql([1, 2, 3]);
const MODULE_BEGIN = sql.begin;

export async function listOrders(): Promise<void> {
  await sql`SELECT ${MODULE_SELECT}`;
  await sql`SELECT ${MODULE_IDS}`;
  await MODULE_BEGIN(async () => undefined);
}
