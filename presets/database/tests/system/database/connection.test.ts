import { afterEach, describe, expect, test } from 'bun:test';
import { createEnv, getOptionalEnv, setEnv } from '@/system/config/environment';

const { closeDatabase, getDatabase } = await import('@/system/database/connection');

const unusedDatabaseUrl = 'postgres://127.0.0.1:1/unused';
const controlledKeys = ['DATABASE_URL', 'NODE_ENV'] as const;
const originalEnv = createEnv({});
const originalValues = new Map(controlledKeys.map((key) => [key, originalEnv[key]]));

function restoreEnv(): void {
  for (const key of controlledKeys) {
    const originalValue = originalValues.get(key);
    setEnv(key, originalValue);
  }
}

afterEach(async () => {
  await closeDatabase();
  restoreEnv();
});

describe('database connection pool', () => {
  test('uses one connection when NODE_ENV is test', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('NODE_ENV', 'test');

    expect(getDatabase().options.max).toBe(1);
  });

  test('uses ten connections outside test', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('NODE_ENV', 'production');

    expect(getDatabase().options.max).toBe(10);
  });

  test('uses ten connections when NODE_ENV is unset', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('NODE_ENV', undefined);

    expect(getOptionalEnv('NODE_ENV')).toBeUndefined();
    expect(getDatabase().options.max).toBe(10);
  });
});
