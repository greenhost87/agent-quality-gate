import noNullUndefinedParameterUnion from '../../oxlint/rules/no-null-undefined-parameter-union.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noNullUndefinedParameterUnionBench: BenchCreateOnceRuleInput = {
  name: 'no-null-undefined-parameter-union',
  ruleId: 'aqg/no-null-undefined-parameter-union',
  rule: noNullUndefinedParameterUnion,
  cases: [
    {
      name: 'hot-params',
      filename: '/bench/no-null-undefined-parameter-union.ts',
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
  await benchCreateOnceRule(noNullUndefinedParameterUnionBench);
}
