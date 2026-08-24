import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'config/no-valibot-custom';
const customMessage =
  'Do not use valibot custom schemas. Prefer structural schemas (object, union, lazy, pipe + check).';
const importMessage =
  'Do not import custom from valibot. Prefer structural schemas (object, union, lazy, pipe + check).';

async function expectRejected(fixture: string, message: string) {
  const result = await runOxlintFixture(`no-valibot-custom/invalid/${fixture}`, 'schema.ts', rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

test('no-valibot-custom rejects namespace v.custom calls', async () => {
  await expectRejected('namespace-custom', customMessage);
});

test('no-valibot-custom rejects named custom() calls', async () => {
  await expectRejected('named-custom-call', customMessage);
});

test('no-valibot-custom rejects importing custom from valibot', async () => {
  await expectRejected('named-custom-import', importMessage);
});

test('no-valibot-custom allows structural schemas', async () => {
  const result = await runOxlintFixture(
    'no-valibot-custom/valid/structural-schema',
    'schema.ts',
    rule,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('no-valibot-custom allows v.check inside pipe', async () => {
  const result = await runOxlintFixture('no-valibot-custom/valid/check-in-pipe', 'schema.ts', rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});
