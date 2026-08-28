import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'bun-parse/no-raw-json-parse';
const jsonParseMessage = 'JSON.parse is banned outside tests.';
const jsonMethodMessage = 'Non-Bun .json() is banned outside tests.';
const unvalidatedBunJsonMessage = 'Pass Bun JSON into v.parse(Schema, raw) before use.';
const unvalidatedParseJsonMessage =
  'Parse JSON text with v.pipe(v.string(), v.parseJson(), Schema); do not stop at unknown.';

async function expectRejected(fixture: string, entry: string, message: string) {
  const result = await runOxlintFixture(`no-raw-json-parse/invalid/${fixture}`, entry, rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

async function expectAllowed(fixture: string, entry: string) {
  const result = await runOxlintFixture(`no-raw-json-parse/valid/${fixture}`, entry, rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-raw-json-parse rejects JSON.parse outside allowlisted paths', async () => {
  await expectRejected('json-parse', 'utils.ts', jsonParseMessage);
});

test('no-raw-json-parse rejects response.json outside allowlisted paths', async () => {
  await expectRejected('response-json', 'app/client.ts', jsonMethodMessage);
});

test('no-raw-json-parse rejects JSON.parse inside an http helper', async () => {
  await expectRejected('http-home', 'http/parse-json-body.ts', jsonParseMessage);
});

test('no-raw-json-parse rejects unvalidated JSON returned from an http helper', async () => {
  await expectRejected('http-unvalidated', 'http/parse-json.ts', jsonParseMessage);
});

test('no-raw-json-parse allows JSON.parse under tests/', async () => {
  await expectAllowed('tests-home', 'tests/fixture-load.ts');
});

test('no-raw-json-parse rejects JSON.parse under scripts/', async () => {
  await expectRejected('scripts-home', 'scripts/load-config.ts', jsonParseMessage);
});

test('no-raw-json-parse allows Bun.file(...).json() when validated with valibot', async () => {
  await expectAllowed('bun-file', 'system/config/load.ts');
});

test('no-raw-json-parse allows module-scope Bun.file(...).json() when validated with valibot', async () => {
  await expectAllowed('module-scope', 'system/config/load.ts');
});

test('no-raw-json-parse allows file(...).json() from bun import when validated with valibot', async () => {
  await expectAllowed('imported-file', 'system/config/load.ts');
});

test('no-raw-json-parse allows renamed file(...).json() from bun import when validated', async () => {
  await expectAllowed('renamed-file-import', 'system/config/load.ts');
});

test('no-raw-json-parse allows const-bound Bun.file(...).json() when validated', async () => {
  await expectAllowed('bound-bun-file', 'system/config/load.ts');
});

test('no-raw-json-parse allows const-bound file(...).json() when validated', async () => {
  await expectAllowed('bound-imported-file', 'system/config/load.ts');
});

test('no-raw-json-parse allows a Bun file bound earlier in the same declaration', async () => {
  await expectAllowed('bound-same-declaration', 'system/config/load.ts');
});

test('no-raw-json-parse allows a const-bound Bun file in a for loop', async () => {
  await expectAllowed('bound-for-loop', 'system/config/load.ts');
});

test('no-raw-json-parse allows module-scope const Bun.file used in a function when validated', async () => {
  await expectAllowed('bound-module-closure', 'system/config/load.ts');
});

test('no-raw-json-parse allows const-bound Bun.file in a switch case when validated', async () => {
  await expectAllowed('bound-switch-case', 'system/config/load.ts');
});

test('no-raw-json-parse rejects Bun.file(...).json() without valibot', async () => {
  await expectRejected('unvalidated-bun-file', 'system/config/load.ts', unvalidatedBunJsonMessage);
});

test('no-raw-json-parse rejects const-bound Bun.file(...).json() without valibot', async () => {
  await expectRejected('bound-unvalidated', 'system/config/load.ts', unvalidatedBunJsonMessage);
});

test('no-raw-json-parse rejects Bun.readableStreamToJSON without valibot', async () => {
  await expectRejected('unvalidated-stream', 'system/config/load.ts', unvalidatedBunJsonMessage);
});

test('no-raw-json-parse rejects unrelated file(...).json() helpers', async () => {
  await expectRejected('unrelated-file-json', 'system/config/load.ts', jsonMethodMessage);
});

test('no-raw-json-parse rejects shadowed non-Bun const .json()', async () => {
  await expectRejected('bound-shadowed', 'system/config/load.ts', jsonMethodMessage);
});

test('no-raw-json-parse rejects a .json() receiver shadowed by a parameter', async () => {
  await expectRejected('bound-parameter-shadowed', 'system/config/load.ts', jsonMethodMessage);
});

test('no-raw-json-parse rejects a bun file import shadowed by a parameter', async () => {
  await expectRejected('bound-import-shadowed', 'system/config/load.ts', jsonMethodMessage);
});

test('no-raw-json-parse rejects a Bun global shadowed by a parameter', async () => {
  await expectRejected('bound-bun-shadowed', 'system/config/load.ts', jsonMethodMessage);
});

test('no-raw-json-parse rejects let-bound Bun.file(...).json()', async () => {
  await expectRejected('bound-let', 'system/config/load.ts', jsonMethodMessage);
});

test('no-raw-json-parse rejects bare v.parseJson text pipe', async () => {
  await expectRejected('bare-parse-json-text', 'http/parse-json.ts', unvalidatedParseJsonMessage);
});

test('no-raw-json-parse rejects const bare v.parseJson text pipe', async () => {
  await expectRejected('bare-parse-json-const', 'http/parse-json.ts', unvalidatedParseJsonMessage);
});

test('no-raw-json-parse rejects two-step bare v.parseJson text pipe', async () => {
  await expectRejected(
    'bare-parse-json-two-step',
    'system/config/load.ts',
    unvalidatedParseJsonMessage,
  );
});

test('no-raw-json-parse allows domain schema in v.parseJson text pipe', async () => {
  await expectAllowed('json-string-pipe', 'system/config/load.ts');
});
