import noIdentityAliases from '../../oxlint/rules/no-identity-aliases.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noIdentityAliasesBench: BenchCreateOnceRuleInput = {
  name: 'no-identity-aliases',
  ruleId: 'aqg/no-identity-aliases',
  rule: noIdentityAliases,
  cases: [
    {
      name: 'hot-aliases',
      filename: '/bench/no-identity-aliases.ts',
      code: repeat((index) => [
        `const source${index} = ${index};`,
        `const alias${index} = source${index};`,
        `const other${index} = alias${index} + 1;`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noIdentityAliasesBench);
}
