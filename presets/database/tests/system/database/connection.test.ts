import { afterEach, describe, expect, test } from 'bun:test';
import { createEnv, getOptionalEnv, setEnv } from '@/system/config/environment';

const { closeDatabase, getDatabaseGeneration, sql } = await import('@/system/database/connection');

const unusedDatabaseUrl = 'postgres://127.0.0.1:1/unused';
const controlledKeys = ['DATABASE_URL', 'DATABASE_POOL_SIZE', 'NODE_ENV'] as const;
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

    expect(sql.options.max).toBe(1);
  });

  test('uses five connections outside test', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('NODE_ENV', 'production');

    expect(sql.options.max).toBe(5);
  });

  test('uses five connections when NODE_ENV is unset', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('DATABASE_POOL_SIZE', undefined);
    setEnv('NODE_ENV', undefined);

    expect(getOptionalEnv('NODE_ENV')).toBeUndefined();
    expect(sql.options.max).toBe(5);
  });

  test('uses DATABASE_POOL_SIZE when set in test', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('DATABASE_POOL_SIZE', '5');
    setEnv('NODE_ENV', 'test');

    expect(sql.options.max).toBe(5);
  });

  test('uses DATABASE_POOL_SIZE when set outside test', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('DATABASE_POOL_SIZE', '25');
    setEnv('NODE_ENV', 'production');

    expect(sql.options.max).toBe(25);
  });

  test('rejects invalid DATABASE_POOL_SIZE', () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('DATABASE_POOL_SIZE', '0');
    setEnv('NODE_ENV', 'production');

    expect(() => sql.options.max).toThrow('Invalid DATABASE_POOL_SIZE env var value: 0');
  });

  test('changes generation only when the active client changes', async () => {
    setEnv('DATABASE_URL', unusedDatabaseUrl);
    setEnv('NODE_ENV', 'test');

    const initial = getDatabaseGeneration();
    expect(getDatabaseGeneration()).toBe(initial);

    await closeDatabase();

    expect(getDatabaseGeneration()).toBeGreaterThan(initial);
  });
});
