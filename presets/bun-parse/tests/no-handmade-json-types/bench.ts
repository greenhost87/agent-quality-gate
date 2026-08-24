import { noHandmadeJsonTypes } from '../../oxlint/no-handmade-json-types.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const noHandmadeJsonTypesBench: BenchCreateOnceRuleInput = {
  name: 'no-handmade-json-types',
  ruleId: 'bun-parse/no-handmade-json-types',
  rule: noHandmadeJsonTypes,
  cases: [
    {
      name: 'hot-recursive-json-unions',
      filename: '/bench/system/config/schema.ts',
      cwd: '/bench',
      code: [
        repeat((index) => [
          `export type TreeObject${index} = { [key: string]: TreeValue${index} };`,
          `export type TreeValue${index} = string | number | boolean | null | TreeObject${index} | TreeValue${index}[];`,
          `export function isTreeObject${index}(value: unknown): value is TreeObject${index} {`,
          `  return typeof value === 'object' && value !== null && !Array.isArray(value);`,
          `}`,
        ]),
      ].join('\n'),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noHandmadeJsonTypesBench);
}
