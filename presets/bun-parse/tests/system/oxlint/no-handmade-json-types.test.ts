import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'bun-parse/no-handmade-json-types';
const typeMessage = 'Replace recursive JSON types with v.InferOutput<typeof Schema>.';

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

test('no-handmade-json-types leaves plain-object guards to no-typeof-object', async () => {
  await expectAllowed('plain-object-guard');
});

test('no-handmade-json-types allows domain types', async () => {
  await expectAllowed('domain-types');
});
