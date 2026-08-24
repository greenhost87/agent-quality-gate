import { noTrivialValibotSchemaAlias } from '../../oxlint/no-trivial-valibot-schema-alias.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const noTrivialValibotSchemaAliasBench: BenchCreateOnceRuleInput = {
  name: 'no-trivial-valibot-schema-alias',
  ruleId: 'config/no-trivial-valibot-schema-alias',
  rule: noTrivialValibotSchemaAlias,
  cases: [
    {
      name: 'hot-exported-aliases',
      filename: '/bench/system/config/schema.ts',
      cwd: '/bench',
      code: [
        "import * as v from 'valibot';",
        '',
        repeat((index) => [`export const StringArraySchema${index} = v.array(v.string());`]),
      ].join('\n'),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noTrivialValibotSchemaAliasBench);
}
