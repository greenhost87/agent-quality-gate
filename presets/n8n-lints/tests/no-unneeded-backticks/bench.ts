import { noUnneededBackticks } from '../../oxlint/no-unneeded-backticks.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const noUnneededBackticksBench: BenchCreateOnceRuleInput = {
  name: 'no-unneeded-backticks',
  ruleId: 'n8n-lints/no-unneeded-backticks',
  rule: noUnneededBackticks,
  cases: [
    {
      name: 'hot-backticks',
      filename: '/bench/labels.ts',
      code: repeat((index) => [`const label${index} = \`plain-${index}\`;`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noUnneededBackticksBench);
}
