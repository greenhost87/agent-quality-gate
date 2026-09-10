import { expect, test } from 'bun:test';
import { getOptionalEnv } from '@/system/config/environment';

test('loading managed test setup modules does not require or set DATABASE_URL', async () => {
  expect(getOptionalEnv('DATABASE_URL')).toBeUndefined();
  await Promise.all([
    import('../../payload/tests/setup/testDatabase.bootstrap.ts'),
    import('../../payload/tests/setup/testDatabase.ts'),
  ]);
  expect(getOptionalEnv('DATABASE_URL')).toBeUndefined();
});
