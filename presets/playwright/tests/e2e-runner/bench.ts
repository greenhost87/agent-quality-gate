import { playwrightPlugin } from '../../oxlint/playwright.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const e2eRunnerBench: BenchCreateOnceRuleInput = {
  name: 'e2e-runner',
  ruleId: 'playwright/e2e-runner',
  rule: playwrightPlugin.rules['e2e-runner'],
  cases: [
    {
      name: 'hot-bun-test-and-launch',
      filename: '/bench/tests/e2e/visualizer.pw.ts',
      cwd: '/bench',
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
