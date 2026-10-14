import { playwrightPlugin } from 'agent-quality-gate/internal/presets/playwright/oxlint/playwright.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const e2eRunnerBench: BenchCreateOnceRuleInput = {
  name: 'e2e-runner',
  ruleId: 'playwright/e2e-runner',
  rule: playwrightPlugin.rules['e2e-runner'],
  cases: [
    {
      name: 'hot-bun-test-and-launch',
      filename: '/bench/tests/e2e/visualizer.pw.ts',
      cwd: '/bench',
      options: [{ e2eDirectory: 'tests/e2e' }],
      code: repeat((index) => [
        `import { test as t${index} } from 'bun:test';`,
        `export async function run${index}() {`,
        `  await chromium.launch();`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(e2eRunnerBench);
}
