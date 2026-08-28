import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'bun-parse/no-handmade-json-types';
const typeMessage = 'Replace generic JSON types and schemas with v.InferOutput<typeof Schema>.';

async function expectRejected(fixture: string, messages: readonly string[]) {
  const result = await runOxlintFixture(
    `no-handmade-json-types/invalid/${fixture}`,
    'schema.ts',
    rule,
  );
  expect(result.status).not.toBe(0);
  for (const message of messages) {
    expect(result.output).toContain(message);
  }
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(
    `no-handmade-json-types/valid/${fixture}`,
    'schema.ts',
    rule,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-handmade-json-types rejects classic JsonValue pair', async () => {
  await expectRejected('classic-pair', [typeMessage]);
});

test('no-handmade-json-types rejects renamed mutual recursion', async () => {
  await expectRejected('renamed-inline', [typeMessage]);
});

test('no-handmade-json-types rejects renamed Json-shaped pair', async () => {
  await expectRejected('renamed-pair', [typeMessage]);
});

test('no-handmade-json-types rejects Record-form recursive JSON union', async () => {
  await expectRejected('record-form', [typeMessage]);
});

test('no-handmade-json-types allows Bun file + valibot InferOutput', async () => {
  await expectAllowed('bun-valibot');
});

test('no-handmade-json-types allows domain types', async () => {
  await expectAllowed('domain-types');
});

test('no-handmade-json-types rejects valibot JsonValue catch-all schema', async () => {
  await expectRejected('valibot-json-value', [typeMessage]);
});

test('no-handmade-json-types rejects exported loose JSON parse return type', async () => {
  await expectRejected('loose-parse-return', [typeMessage]);
});

test('no-handmade-json-types allows domain schema parser exports', async () => {
  await expectAllowed('domain-schema-parser');
});

test('no-handmade-json-types rejects loose v.record string unknown schema', async () => {
  await expectRejected('loose-record-schema', [typeMessage]);
});

test('no-handmade-json-types rejects valibot isPlainObject predicate', async () => {
  await expectRejected('plain-object-predicate', [typeMessage]);
});

test('no-handmade-json-types rejects exported object parse return', async () => {
  await expectRejected('loose-object-return', [typeMessage]);
});

test('no-handmade-json-types allows record with primitive values', async () => {
  await expectAllowed('record-primitive-values');
});

test('no-handmade-json-types allows nested domain record fields', async () => {
  await expectAllowed('nested-domain-record');
});
