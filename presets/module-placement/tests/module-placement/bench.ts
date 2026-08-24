import { modulePlacement } from '../../oxlint/module-placement.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

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
