import noUselessExportedTypeAliases from '../../oxlint/rules/no-useless-exported-type-aliases.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noUselessExportedTypeAliasesBench: BenchCreateOnceRuleInput = {
  name: 'no-useless-exported-type-aliases',
  ruleId: 'aqg/no-useless-exported-type-aliases',
  rule: noUselessExportedTypeAliases,
  cases: [
    {
      name: 'hot-aliases',
      filename: '/bench/no-useless-exported-type-aliases.types.ts',
      code: repeat((index) => [
        `type Base${index} = { id: number; name: string };`,
        `export type Alias${index} = Base${index};`,
        `export type Useful${index} = { id: number; name: string };`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noUselessExportedTypeAliasesBench);
}
