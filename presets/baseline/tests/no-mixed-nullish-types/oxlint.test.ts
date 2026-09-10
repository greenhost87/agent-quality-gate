import { expect, test } from 'bun:test';

import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'aqg/no-mixed-nullish-types';

test('rejects direct mixed types and optional nullish values across declarations', async () => {
  const result = await runOxlintFixture('no-mixed-nullish-types/invalid', 'source.ts', rule);
  expect(result.status).toBe(1);
  expect(result.output.match(/aqg\(no-mixed-nullish-types\)/g)).toHaveLength(29);
  expect(result.output).toContain('null, optional');
  expect(result.output).toContain('optional, void');
  expect(result.output).toContain('null, undefined');
});

test('allows single absence forms and keeps optional separate from nested values', async () => {
  const result = await runOxlintFixture('no-mixed-nullish-types/valid', 'source.ts', rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});
