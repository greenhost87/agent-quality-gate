import { noTypeofObject } from '../../oxlint/no-typeof-object.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const noTypeofObjectBench: BenchCreateOnceRuleInput = {
  name: 'no-typeof-object',
  ruleId: 'bun-parse/no-typeof-object',
  rule: noTypeofObject,
  cases: [
    {
      name: 'hot-typeof-object',
      filename: '/bench/utils.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `export function check${index}(value: unknown): boolean {`,
        `  return typeof value === 'object' && value !== null && !Array.isArray(value);`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noTypeofObjectBench);
}
