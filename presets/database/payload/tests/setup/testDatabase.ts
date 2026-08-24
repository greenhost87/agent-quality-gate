// Managed by agent-quality-gate. Do not edit; changes are overwritten on verify.

import { afterAll, beforeAll, beforeEach } from 'bun:test';
import { setEnv } from '@/system/config/environment';
import {
  dropApplicationDatabase,
  ensureWorkerApplicationDatabase,
  recreateApplicationDatabaseFromTemplate,
} from './testDatabase.bootstrap';

// Load the production client only after a DB-using suite asks for isolation.
const { closeDatabase } = await import('@/system/database/connection');

export function useIsolatedTestDatabase(_testId: string): void {
  beforeAll(async () => {
    await ensureWorkerApplicationDatabase();
  }, 120_000);

  beforeEach(async () => {
    await closeDatabase().catch(() => undefined);
    await recreateApplicationDatabaseFromTemplate();
  }, 30_000);

  afterAll(async () => {
    try {
      await closeDatabase().catch(() => undefined);
    } finally {
      try {
        await dropApplicationDatabase();
      } finally {
        setEnv('DATABASE_URL', undefined);
      }
    }
  }, 30_000);
}
