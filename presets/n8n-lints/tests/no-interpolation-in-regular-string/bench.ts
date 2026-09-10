import { noInterpolationInRegularString } from '../../oxlint/no-interpolation-in-regular-string.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const noInterpolationInRegularStringBench: BenchCreateOnceRuleInput = {
  name: 'no-interpolation-in-regular-string',
  ruleId: 'n8n-lints/no-interpolation-in-regular-string',
  rule: noInterpolationInRegularString,
  cases: [
    {
      name: 'hot-interpolations',
      filename: '/bench/greetings.ts',
      code: repeat((index) => [`const greeting${index} = 'hello \${name${index}}';`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noInterpolationInRegularStringBench);
}
