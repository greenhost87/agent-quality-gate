import noMixedNullishTypes from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-mixed-nullish-types.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noMixedNullishTypesBench: BenchCreateOnceRuleInput = {
  name: 'no-mixed-nullish-types',
  ruleId: 'aqg/no-mixed-nullish-types',
  rule: noMixedNullishTypes,
  cases: [
    {
      name: 'hot-params',
      filename: '/bench/no-mixed-nullish-types.ts',
      code: repeat((index) => [
        `export function take${index}(value: string | null | undefined): string | null {`,
        `  return value ?? null;`,
        `}`,
        `export function keep${index}(value: string | null): string | null {`,
        `  return value;`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noMixedNullishTypesBench);
}
