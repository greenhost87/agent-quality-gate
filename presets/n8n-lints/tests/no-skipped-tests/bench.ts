import { noSkippedTests } from '../../oxlint/no-skipped-tests.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const noSkippedTestsBench: BenchCreateOnceRuleInput = {
  name: 'no-skipped-tests',
  ruleId: 'n8n-lints/no-skipped-tests',
  rule: noSkippedTests,
  cases: [
    {
      name: 'hot-skips',
      filename: '/bench/focused.test.ts',
      code: repeat((index) => [`test.skip('case-${index}', () => {});`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noSkippedTestsBench);
}
