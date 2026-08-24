import noUnknownParameters from '../../oxlint/rules/no-unknown-parameters.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noUnknownParametersBench: BenchCreateOnceRuleInput = {
  name: 'no-unknown-parameters',
  ruleId: 'aqg/no-unknown-parameters',
  rule: noUnknownParameters,
  cases: [
    {
      name: 'hot-unknown',
      filename: '/bench/no-unknown-parameters.ts',
      code: repeat((index) => [
        `export function read${index}(value: unknown): unknown {`,
        `  return value;`,
        `}`,
        `export function typed${index}(value: string): string {`,
        `  return value;`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noUnknownParametersBench);
}
