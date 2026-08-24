// Managed by agent-quality-gate. Do not edit; changes are overwritten on verify.

import { SQL } from 'bun';
import { getRequiredEnv, isNodeEnvironment } from '@/system/config/environment';

let client: SQL | null = null;

export function getDatabase(): SQL {
  client ??= new SQL({
    url: getRequiredEnv('DATABASE_URL'),
    max: isNodeEnvironment('test') ? 1 : 10,
  });
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (!client) {
    return;
  }
  const active = client;
  client = null;
  await active.close();
}
