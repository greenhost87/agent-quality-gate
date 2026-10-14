import noUnknownParameters from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-unknown-parameters.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

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
