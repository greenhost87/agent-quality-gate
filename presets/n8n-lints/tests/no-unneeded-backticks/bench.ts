import { noUnneededBackticks } from 'agent-quality-gate/internal/presets/n8n-lints/oxlint/no-unneeded-backticks.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

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
