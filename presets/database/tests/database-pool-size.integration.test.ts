import { afterEach, describe, expect, test } from 'bun:test';
import { chdir } from 'node:process';
import { resolve } from 'node:path';
import { SQL } from 'bun';
import { createEnv, getRequiredEnv, setEnv } from '@/system/config/environment';
import { useIsolatedTestDatabase } from '../payload/tests/setup/testDatabase.ts';

const presetRoot = resolve(import.meta.dir, '..');
chdir(presetRoot);

const { closeDatabase, sql } = await import('@/system/database/connection');

const controlledKeys = ['DATABASE_POOL_SIZE', 'NODE_ENV'] as const;
const originalEnv = createEnv({});
const originalValues = new Map(controlledKeys.map((key) => [key, originalEnv[key]]));

function restoreEnv(): void {
  for (const key of controlledKeys) {
    setEnv(key, originalValues.get(key));
  }
}

useIsolatedTestDatabase(import.meta.path);

afterEach(async () => {
  await closeDatabase();
  restoreEnv();
});

async function countOtherClientBackends(monitor: SQL): Promise<number> {
  const rows = await monitor<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'
  `;
  return rows[0]?.count ?? 0;
}

async function measurePeakOtherClientBackends(during: () => Promise<unknown>): Promise<number> {
  await using monitor = new SQL({ url: getRequiredEnv('DATABASE_URL'), max: 1 });
  let peak = 0;
  let stop = false;
  const polling = (async () => {
    while (!stop) {
      peak = Math.max(peak, await countOtherClientBackends(monitor));
      await Bun.sleep(10);
    }
  })();
  try {
    await during();
  } finally {
    stop = true;
    await polling;
  }
  return peak;
}

describe('database pool size', () => {
  test('does not exceed DATABASE_POOL_SIZE backend connections under concurrent load', async () => {
    setEnv('DATABASE_POOL_SIZE', '5');
    setEnv('NODE_ENV', 'production');

    expect(sql.options.max).toBe(5);

    const peak = await measurePeakOtherClientBackends(async () => {
      await Promise.all(Array.from({ length: 20 }, () => sql`SELECT pg_sleep(0.5)`));
    });

    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  test('uses the production default pool size when DATABASE_POOL_SIZE is unset', async () => {
    setEnv('DATABASE_POOL_SIZE', undefined);
    setEnv('NODE_ENV', 'production');

    expect(sql.options.max).toBe(5);

    const peak = await measurePeakOtherClientBackends(async () => {
      await Promise.all(Array.from({ length: 20 }, () => sql`SELECT pg_sleep(0.5)`));
    });

    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });
});
