import { playwrightPlugin } from 'agent-quality-gate/internal/presets/playwright/oxlint/playwright.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const playwrightConfigBench: BenchCreateOnceRuleInput = {
  name: 'playwright-config',
  ruleId: 'playwright/config',
  rule: playwrightPlugin.rules.config,
  cases: [
    {
      name: 'hot-incomplete-config',
      filename: '/bench/playwright.config.ts',
      cwd: '/bench',
      code: [
        'export default { use: {} };',
        repeat((index) => [
          `export function helper${index}(value: number): number {`,
          `  return value + ${index};`,
          `}`,
        ]),
      ].join('\n'),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(playwrightConfigBench);
}
