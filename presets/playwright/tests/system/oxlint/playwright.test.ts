import { expect, test } from 'bun:test';
import { runOxlintFixture } from './run-oxlint.ts';

const runnerRule = 'playwright/e2e-runner';
const blackBoxRule = 'playwright/e2e-black-box';
const configRule = 'playwright/config';

async function expectRejected(fixture: string, entry: string, rule: string, message: string) {
  const result = await runOxlintFixture(fixture, entry, rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

async function expectAllowed(fixture: string, entry: string, rule: string) {
  const result = await runOxlintFixture(fixture, entry, rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('Foreman-shaped visualizer e2e is rejected as a custom Playwright runner', async () => {
  const result = await runOxlintFixture(
    'e2e-runner/invalid/foreman-visualizer',
    'tests/e2e/visualizer.test.ts',
    runnerRule,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('Playwright e2e specs must be named tests/e2e/**/*.pw.ts.');
  expect(result.output).toContain(
    'Playwright e2e must import test from @playwright/test, not bun:test.',
  );
  expect(result.output).toContain(
    'Playwright e2e must use the page fixture; do not call chromium.launch, firefox.launch, or webkit.launch.',
  );
  expect(result.output).toContain(
    'Playwright e2e must not spawn the app server; declare webServer in playwright.config.ts.',
  );
  expect(result.output).toContain(
    'Playwright e2e must not import tests/setup/testDatabase.ts; start the app through playwright.config webServer.',
  );
});

test('e2e runner rejects bun:test, launch, spawn, and the bun database hook', async () => {
  await expectRejected(
    'e2e-runner/invalid/bun-test',
    'tests/e2e/visualizer.pw.ts',
    runnerRule,
    'Playwright e2e must import test from @playwright/test, not bun:test.',
  );
  await expectRejected(
    'e2e-runner/invalid/launch-page',
    'tests/e2e/visualizer.pw.ts',
    runnerRule,
    'Playwright e2e must use the page fixture; do not call chromium.launch, firefox.launch, or webkit.launch.',
  );
  await expectRejected(
    'e2e-runner/invalid/spawn-spec',
    'tests/e2e/visualizer.pw.ts',
    runnerRule,
    'Playwright e2e must not spawn the app server; declare webServer in playwright.config.ts.',
  );
  await expectRejected(
    'e2e-runner/invalid/test-database',
    'tests/e2e/visualizer.pw.ts',
    runnerRule,
    'Playwright e2e must not import tests/setup/testDatabase.ts; start the app through playwright.config webServer.',
  );
});

test('e2e runner allows a Playwright page-fixture spec and helper', async () => {
  await expectAllowed('e2e-runner/valid/page-fixture', 'tests/e2e/visualizer.pw.ts', runnerRule);
  await expectAllowed('e2e-runner/valid/helper', 'tests/e2e/visualizer.helpers.ts', runnerRule);
});

test('e2e black box rejects DAO and system/database imports', async () => {
  await expectRejected(
    'e2e-black-box/invalid/dao-import',
    'tests/e2e/visualizer.pw.ts',
    blackBoxRule,
    'Playwright e2e must not import DAO modules; drive the app through the UI.',
  );
  await expectRejected(
    'e2e-black-box/invalid/database-import',
    'tests/e2e/visualizer.pw.ts',
    blackBoxRule,
    'Playwright e2e must not import system/database; drive the app through the UI.',
  );
});

test('e2e black box allows UI-only Playwright specs', async () => {
  await expectAllowed('e2e-black-box/valid/ui-only', 'tests/e2e/visualizer.pw.ts', blackBoxRule);
});

test('Playwright config requires use.baseURL and webServer', async () => {
  await expectRejected(
    'config/invalid/missing-web-server',
    'playwright.config.ts',
    configRule,
    'Playwright config must set use.baseURL and webServer.',
  );
  await expectAllowed('config/valid/web-server', 'playwright.config.ts', configRule);
});
