import { sql } from '@/system/database/connection';

export async function ping(): Promise<void> {
  await sql`SELECT 1`;
}
