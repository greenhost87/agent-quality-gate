import { expect, test } from 'bun:test';

import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'aqg/no-class';
const enabled = ['error', { suffixes: ['Error', 'Element'] }] as const;
const forbidden =
  'Classes are banned unless the superclass or class name ends with a configured suffix.';

async function expectRejected(fixture: string) {
  const result = await runOxlintFixture(`no-class/invalid/${fixture}`, 'source.ts', rule, [
    ...enabled,
  ]);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(forbidden);
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(`no-class/valid/${fixture}`, 'source.ts', rule, [
    ...enabled,
  ]);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-class is inactive without options', async () => {
  const result = await runOxlintFixture('no-class/invalid/plain-class', 'source.ts', rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('no-class rejects plain class declarations when enabled', async () => {
  await expectRejected('plain-class');
});

test('no-class rejects classes that extend non-suffix bases when enabled', async () => {
  await expectRejected('extends-other');
});

test('no-class rejects class expressions when enabled', async () => {
  await expectRejected('class-expression');
});

test('no-class allows Error subclasses when enabled', async () => {
  await expectAllowed('error-subclass');
});

test('no-class allows HTMLElement subclasses when enabled', async () => {
  await expectAllowed('element-subclass');
});

test('no-class allows transitive *Error chains when enabled', async () => {
  await expectAllowed('transitive-error');
});

test('no-class ignores declare class when enabled', async () => {
  await expectAllowed('declare-class');
});
