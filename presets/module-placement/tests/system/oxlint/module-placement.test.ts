import { expect, test } from 'bun:test';

import { piForemanOptions, agentTaskRunnerOptions, runOxlintFixture } from './run-oxlint.ts';

const placementMessage =
  'Production modules under system/agents must use 1 to 1 concern directory segments.';

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

test('module placement allows the top-level tests tree at any depth', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/deep-tests',
    'system/agents/tests/history/normalize.test.ts',
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

const redundantPrefixMessage =
  'Module "workflows-list.tsx" repeats the "workflows/" path context; use a basename without that prefix. Exact mirrored concern/module names remain valid.';

test('module placement rejects redundant concern prefixes in route modules', async () => {
  const result = await runOxlintFixture(
    'module-placement/invalid/redundant-prefix',
    'app/app/workflows/workflows-list.tsx',
    agentTaskRunnerOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(redundantPrefixMessage);
});

test('module placement allows short route module names', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/route-names',
    'app/app/workflows/list.tsx',
    agentTaskRunnerOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('module placement allows mirrored route modules two concerns deep', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/route-names',
    'app/app/workflow/list/list.tsx',
    agentTaskRunnerOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

const editorPrefixMessage =
  'Module "editor-canvas-chrome.tsx" repeats the "edit/" path context; use a basename without that prefix. Exact mirrored concern/module names remain valid.';

test('module placement rejects prefixes copied from any ancestor concern', async () => {
  const result = await runOxlintFixture(
    'module-placement/invalid/editor-prefix',
    'app/components/ui/workflow/edit/editor-canvas-chrome.tsx',
    agentTaskRunnerOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(editorPrefixMessage);
});

test('module placement rejects UI modules deeper than the configured maximum', async () => {
  const result = await runOxlintFixture(
    'module-placement/invalid/editor-prefix',
    'app/components/ui/workflow/edit/editor-canvas-chrome/editor-canvas-chrome.tsx',
    agentTaskRunnerOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(
    'Production modules under app/components/ui must use 1 to 2 concern directory segments.',
  );
  expect(result.output).toContain(editorPrefixMessage);
});

test('module placement allows mirrored component concern names without prefixes', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/component-concern',
    'app/components/ui/workflow/canvas-chrome/canvas-chrome.tsx',
    agentTaskRunnerOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});

test('module placement allows Phoenix-style button/button modules', async () => {
  const result = await runOxlintFixture(
    'module-placement/valid/component-concern',
    'app/components/ui/button/button.tsx',
    {
      directories: ['app/components/ui'],
      forbidConcernPrefix: ['app/components/ui'],
    },
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
});
