import { noErrorInstanceInToThrow } from 'agent-quality-gate/internal/presets/n8n-lints/oxlint/no-error-instance-in-to-throw.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const noErrorInstanceInToThrowBench: BenchCreateOnceRuleInput = {
  name: 'no-error-instance-in-to-throw',
  ruleId: 'n8n-lints/no-error-instance-in-to-throw',
  rule: noErrorInstanceInToThrow,
  cases: [
    {
      name: 'hot-instances',
      filename: '/bench/throws.test.ts',
      code: repeat((index) => [`expect(run${index}()).toThrow(new Error('boom-${index}'));`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noErrorInstanceInToThrowBench);
}
