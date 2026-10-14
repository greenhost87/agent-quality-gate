import noTrivialConstWrappers from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-trivial-const-wrappers.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noTrivialConstWrappersBench: BenchCreateOnceRuleInput = {
  name: 'no-trivial-const-wrappers',
  ruleId: 'aqg/no-trivial-const-wrappers',
  rule: noTrivialConstWrappers,
  cases: [
    {
      name: 'hot-functions',
      filename: '/bench/no-trivial-const-wrappers.ts',
      code: repeat((index) => [
        `const names${index} = ['a', 'b'] as const;`,
        `export function listNames${index}(): string[] {`,
        `  return [...names${index}];`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noTrivialConstWrappersBench);
}
