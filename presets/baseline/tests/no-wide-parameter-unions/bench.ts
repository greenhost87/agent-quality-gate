import noWideParameterUnions from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-wide-parameter-unions.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noWideParameterUnionsBench: BenchCreateOnceRuleInput = {
  name: 'no-wide-parameter-unions',
  ruleId: 'aqg/no-wide-parameter-unions',
  rule: noWideParameterUnions,
  cases: [
    {
      name: 'hot-wide',
      filename: '/bench/no-wide-parameter-unions.ts',
      code: repeat((index) => [
        `export function wide${index}(value: string | number | boolean | object): void {`,
        `  void value;`,
        `}`,
        `export function narrow${index}(value: 'a' | 'b'): void {`,
        `  void value;`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noWideParameterUnionsBench);
}
