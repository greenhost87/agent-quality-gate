import { noSkippedTests } from 'agent-quality-gate/internal/presets/n8n-lints/oxlint/no-skipped-tests.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

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
