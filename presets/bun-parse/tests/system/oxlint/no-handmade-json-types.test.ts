import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'bun-parse/no-handmade-json-types';
const typeMessage =
  'Do not invent a recursive JSON type. Parse with Bun + valibot and take types from v.InferOutput.';
const guardMessage =
  'Do not invent a plain-object JSON type guard. Parse with Bun + valibot and take types from v.InferOutput.';

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

test('no-handmade-json-types rejects classic JsonValue pair and guard', async () => {
  await expectRejected('classic-pair', [typeMessage, guardMessage]);
});

test('no-handmade-json-types rejects renamed mutual recursion and guard', async () => {
  await expectRejected('renamed-inline', [typeMessage, guardMessage]);
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

test('no-handmade-json-types allows plain-object guard to Record<string, unknown>', async () => {
  await expectAllowed('plain-object-guard');
});

test('no-handmade-json-types allows domain types', async () => {
  await expectAllowed('domain-types');
});
