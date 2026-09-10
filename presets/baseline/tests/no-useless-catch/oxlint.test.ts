import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { readOxlintConfig } from '../../../../config/verify-config-files/verify-config-files.js';
import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'no-useless-catch';

async function expectRejected(fixture: string) {
  const result = await runOxlintFixture(
    `no-useless-catch/invalid/${fixture}`,
    'source.ts',
    rule,
    'error',
    { usePlugin: false },
  );
  expect(result.status).not.toBe(0);
  expect(result.output.toLowerCase()).toContain('useless');
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(
    `no-useless-catch/valid/${fixture}`,
    'source.ts',
    rule,
    'error',
    { usePlugin: false },
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-useless-catch rejects bare rethrow catch blocks', async () => {
  await expectRejected('bare-rethrow');
});

test('no-useless-catch allows logging in catch', async () => {
  await expectAllowed('logging');
});

test('no-useless-catch allows wrapping rethrows', async () => {
  await expectAllowed('wrapping');
});

test('no-useless-catch allows mismatched rethrows', async () => {
  await expectAllowed('mismatch');
});

test('assets baseline keeps native no-useless-catch enabled', () => {
  const config = readOxlintConfig(join(import.meta.dir, '../../../../assets'));
  expect(config.rules?.['no-useless-catch']).toBe('error');
});
