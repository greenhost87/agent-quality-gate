import { expect, test } from 'bun:test';
import { getOptionalEnv } from '@/system/config/environment';

test('loading testDatabase.bootstrap does not set DATABASE_URL', async () => {
  expect(getOptionalEnv('DATABASE_URL')).toBeUndefined();
  await import('../../payload/tests/setup/testDatabase.bootstrap.ts');
  expect(getOptionalEnv('DATABASE_URL')).toBeUndefined();
});
