import { playwrightPlugin } from '../../oxlint/playwright.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

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
