import { getDatabase } from '@/system/database/connection';

export type RuntimeItem = {
  id: number;
  name: string;
};

export async function listRuntimeItems(): Promise<RuntimeItem[]> {
  return await getDatabase()<RuntimeItem[]>`SELECT id, name FROM runtime_items ORDER BY id`;
}

export async function insertRuntimeItem(name: string): Promise<RuntimeItem> {
  const rows = await getDatabase()<RuntimeItem[]>`
    INSERT INTO runtime_items (name)
    VALUES (${name})
    RETURNING id, name
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Failed to insert runtime item');
  }
  return row;
}

export async function countRuntimeItems(): Promise<number> {
  const rows = await getDatabase()<
    { count: string }[]
  >`SELECT COUNT(*)::text AS count FROM runtime_items`;
  return Number(rows[0]?.count ?? 0);
}

export async function insertRuntimeItemInTransaction(name: string): Promise<void> {
  await getDatabase().begin(async (tx) => {
    await tx`INSERT INTO runtime_items (name) VALUES (${name})`;
  });
}

export async function insertRuntimeItemThenFail(name: string): Promise<void> {
  await getDatabase().begin(async (tx) => {
    await tx`INSERT INTO runtime_items (name) VALUES (${name})`;
    throw new Error('force rollback');
  });
}
