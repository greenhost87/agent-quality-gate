import { noValibotCustom } from 'agent-quality-gate/internal/presets/config/oxlint/no-valibot-custom.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const noValibotCustomBench: BenchCreateOnceRuleInput = {
  name: 'no-valibot-custom',
  ruleId: 'config/no-valibot-custom',
  rule: noValibotCustom,
  cases: [
    {
      name: 'hot-custom-calls',
      filename: '/bench/system/config/schema.ts',
      cwd: '/bench',
      code: [
        "import * as v from 'valibot';",
        '',
        repeat((index) => [
          `export const Schema${index} = v.custom<string>(`,
          `  (input): input is string => typeof input === 'string' && input.length === ${index},`,
          ');',
        ]),
      ].join('\n'),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noValibotCustomBench);
}
