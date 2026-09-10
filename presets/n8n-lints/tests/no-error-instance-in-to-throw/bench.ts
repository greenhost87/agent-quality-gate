import { noErrorInstanceInToThrow } from '../../oxlint/no-error-instance-in-to-throw.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

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
