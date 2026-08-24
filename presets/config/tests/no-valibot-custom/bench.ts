import { noValibotCustom } from '../../oxlint/no-valibot-custom.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

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
