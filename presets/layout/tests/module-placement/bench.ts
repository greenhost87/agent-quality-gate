import { modulePlacement } from 'agent-quality-gate/internal/presets/layout/oxlint/module-placement.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const modulePlacementBench: BenchCreateOnceRuleInput = {
  name: 'module-placement',
  ruleId: 'module-placement/module-placement',
  rule: modulePlacement,
  cases: [
    {
      name: 'hot-misplaced',
      filename: '/bench/system/orders.ts',
      cwd: '/bench',
      options: [{ directories: ['system'], rootExceptions: {} }],
      code: repeat((index) => [
        `export function run${index}(): number {`,
        `  return ${index};`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(modulePlacementBench);
}
