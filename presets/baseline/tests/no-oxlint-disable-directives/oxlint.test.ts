import { expect, test } from 'bun:test';

import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'aqg/no-oxlint-disable-directives';
const forbidden = 'Inline lint directives are forbidden';

async function expectRejected(fixture: string) {
  const result = await runOxlintFixture(
    `no-oxlint-disable-directives/invalid/${fixture}`,
    'source.ts',
    rule,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(forbidden);
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(
    `no-oxlint-disable-directives/valid/${fixture}`,
    'source.ts',
    rule,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-oxlint-disable-directives rejects oxlint-disable-next-line', async () => {
  await expectRejected('disable-next-line');
});

test('no-oxlint-disable-directives rejects blanket oxlint-disable', async () => {
  await expectRejected('blanket-disable');
});

test('no-oxlint-disable-directives rejects self-targeted rule disable', async () => {
  await expectRejected('self-disable-rule');
});

test('no-oxlint-disable-directives rejects oxlint-disable-line', async () => {
  await expectRejected('disable-line');
});

test('no-oxlint-disable-directives rejects disable-line aimed at this rule', async () => {
  await expectRejected('disable-line-self');
});

test('no-oxlint-disable-directives rejects disable-next-line on the last line', async () => {
  await expectRejected('disable-next-line-on-last');
});

test('no-oxlint-disable-directives allows clean source', async () => {
  await expectAllowed('clean');
});

test('no-oxlint-disable-directives ignores eslint-disable', async () => {
  await expectAllowed('eslint-disable-only');
});

test('no-oxlint-disable-directives ignores oxlint-enable alone', async () => {
  await expectAllowed('enable-only');
});
