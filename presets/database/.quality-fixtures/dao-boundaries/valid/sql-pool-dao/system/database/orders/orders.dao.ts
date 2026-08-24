import { getDatabase } from '@/system/database/connection';

export async function ping(): Promise<void> {
  await getDatabase()`SELECT 1`;
}
