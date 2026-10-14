import { noTrivialValibotSchemaAlias } from 'agent-quality-gate/internal/presets/config/oxlint/no-trivial-valibot-schema-alias.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

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
