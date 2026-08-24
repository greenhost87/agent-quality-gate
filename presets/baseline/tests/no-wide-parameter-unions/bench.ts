import noWideParameterUnions from '../../oxlint/rules/no-wide-parameter-unions.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

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
