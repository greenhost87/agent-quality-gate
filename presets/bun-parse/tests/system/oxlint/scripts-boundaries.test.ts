import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'bun-parse/scripts-boundaries';
const scriptsImportMessage =
  'scripts/ is CLI-only; move shared parse helpers to production modules.';

async function expectRejected(fixture: string, entry: string) {
  const result = await runOxlintFixture(`scripts-boundaries/invalid/${fixture}`, entry, rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(scriptsImportMessage);
}

async function expectAllowed(fixture: string, entry: string) {
  const result = await runOxlintFixture(`scripts-boundaries/valid/${fixture}`, entry, rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('scripts-boundaries rejects @/scripts imports outside scripts/', async () => {
  await expectRejected('alias-import', 'app/load.ts');
});

test('scripts-boundaries rejects relative scripts imports outside scripts/', async () => {
  await expectRejected('relative-import', 'app/load.ts');
});

test('scripts-boundaries rejects export-from scripts outside scripts/', async () => {
  await expectRejected('export-from', 'app/load.ts');
});

test('scripts-boundaries rejects dynamic import of scripts outside scripts/', async () => {
  await expectRejected('dynamic-import', 'app/load.ts');
});

test('scripts-boundaries allows imports inside scripts/', async () => {
  await expectAllowed('scripts-internal', 'scripts/load-config.ts');
});

test('scripts-boundaries allows non-scripts imports outside scripts/', async () => {
  await expectAllowed('non-scripts', 'app/load.ts');
});

test('scripts-boundaries allows scripts imports from tests/', async () => {
  await expectAllowed('tests-import', 'tests/load.test.ts');
});
