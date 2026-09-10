import { expect, test } from 'bun:test';

import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'aqg/no-production-test-substitution';

test('rejects replacement of real modules including aliases, module mocks and mutations', async () => {
  const result = await runOxlintFixture(
    'no-production-test-substitution/invalid',
    'tests/behavior.test.ts',
    rule,
  );
  expect(result.status).toBe(1);
  expect(result.output.match(/error aqg\(no-production-test-substitution\)/gu)).toHaveLength(10);
  expect(result.output).toContain('Do not replace production code in tests');
  expect(result.output).toContain('statically known external');
});

test('allows external boundaries, local ports, ordinary mocks and data mutation', async () => {
  const result = await runOxlintFixture(
    'no-production-test-substitution/valid',
    'tests/behavior.test.ts',
    rule,
  );
  expect(result.status).toBe(0);
  expect(result.output).toBe('');
});

test('does not apply the test substitution policy to runtime files', async () => {
  const result = await runOxlintFixture(
    'no-production-test-substitution/runtime',
    'source.ts',
    rule,
  );
  expect(result.status).toBe(0);
  expect(result.output).toBe('');
});
