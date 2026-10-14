import noIdentityAliases from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-identity-aliases.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

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
