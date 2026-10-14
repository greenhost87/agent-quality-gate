import noIndexedAccessTypes from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-indexed-access-types.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noIndexedAccessTypesBench: BenchCreateOnceRuleInput = {
  name: 'no-indexed-access-types',
  ruleId: 'aqg/no-indexed-access-types',
  rule: noIndexedAccessTypes,
  cases: [
    {
      name: 'hot-indexed',
      filename: '/bench/no-indexed-access-types.types.ts',
      code: repeat((index) => [
        `export type Row${index} = { id: number; name: string };`,
        `export type Id${index} = Row${index}['id'];`,
        `export type Name${index} = Row${index}['name'];`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noIndexedAccessTypesBench);
}
