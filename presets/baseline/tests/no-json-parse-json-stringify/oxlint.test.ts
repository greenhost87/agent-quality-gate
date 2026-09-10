import { expect, test } from 'bun:test';

import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'aqg/no-json-parse-json-stringify';
const message = 'Replace `JSON.parse(JSON.stringify(value))` with `structuredClone(value)`.';

async function expectRejected(fixture: string) {
  const result = await runOxlintFixture(
    `no-json-parse-json-stringify/invalid/${fixture}`,
    'source.ts',
    rule,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(
    `no-json-parse-json-stringify/valid/${fixture}`,
    'source.ts',
    rule,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-json-parse-json-stringify rejects direct JSON.parse(JSON.stringify(...))', async () => {
  await expectRejected('direct');
});

test('no-json-parse-json-stringify rejects computed-member JSON["parse"] form', async () => {
  await expectRejected('computed');
});

test('no-json-parse-json-stringify allows lone parse', async () => {
  await expectAllowed('lone-parse');
});

test('no-json-parse-json-stringify allows structuredClone', async () => {
  await expectAllowed('structured-clone');
});
