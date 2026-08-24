import { expect, test } from 'bun:test';
import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'config/environment-boundaries';
const errorMessage = 'Access environment variables only through system/config/environment.ts.';

async function expectRejected(fixture: string, entry: string) {
  const result = await runOxlintFixture(`environment-boundaries/invalid/${fixture}`, entry, rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(errorMessage);
}

test('environment boundaries reject process.env access outside the environment module', async () => {
  await Promise.all(
    ['process-env-read', 'process-env-assign', 'process-env-delete', 'process-bracket-env'].map(
      async (fixture) => expectRejected(fixture, 'system/orders/service.ts'),
    ),
  );
});

test('environment boundaries reject destructuring env from process', async () => {
  await expectRejected('destructure-env', 'tests/setup.ts');
});

test('environment boundaries allow process.env access inside the environment module', async () => {
  const result = await runOxlintFixture(
    'environment-boundaries/valid/env-module',
    'system/config/environment.ts',
    rule,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('environment boundaries allow consumers of the environment module', async () => {
  const result = await runOxlintFixture(
    'environment-boundaries/valid/consumer',
    'system/orders/service.ts',
    rule,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});
