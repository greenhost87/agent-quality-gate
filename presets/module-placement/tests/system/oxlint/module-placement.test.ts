import { expect, test } from 'bun:test';

import { piForemanOptions, runOxlintFixture } from './run-oxlint.ts';

const placementMessage =
  'Production modules must live in system/agents/<concern>/, not directly under system/agents/.';

test('module placement is a no-op without configured directories', async () => {
  const result = await runOxlintFixture(
    'module-placement/invalid/flat',
    'system/agents/worker-runtime.ts',
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('module placement rejects flat files under a watched directory', async () => {
  const result = await runOxlintFixture(
    'module-placement/invalid/flat',
    'system/agents/worker-runtime.ts',
    piForemanOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(placementMessage);
});

test('module placement rejects nested paths deeper than one concern segment', async () => {
  const result = await runOxlintFixture(
    'module-placement/invalid/too-deep',
    'system/agents/cursor/history/normalize.ts',
    piForemanOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(placementMessage);
});

test('module placement allows concern directories', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/nested',
    'system/agents/workers/worker-runtime.ts',
    piForemanOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('module placement allows configured root exceptions', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/root-exception',
    'system/agents/agents.types.ts',
    piForemanOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('module placement allows colocated tests under concern/tests', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/colocated-tests',
    'system/agents/workers/tests/worker-runtime.test.ts',
    piForemanOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('module placement ignores paths outside watched directories', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/unwatched',
    'system/task-execution/executor.ts',
    piForemanOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});
