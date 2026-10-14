import noInlineMultilineTestData from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-inline-multiline-test-data.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noInlineMultilineTestDataBench: BenchCreateOnceRuleInput = {
  name: 'no-inline-multiline-test-data',
  ruleId: 'aqg/no-inline-multiline-test-data',
  rule: noInlineMultilineTestData,
  cases: [
    {
      name: 'hot-test-data',
      filename: '/bench/tests/no-inline-multiline-test-data.test.ts',
      code: repeat((index) => [
        `const data${index} = ['line-a-${index}', 'line-b-${index}'].join('\\n');`,
        `const ok${index} = 'one-line-${index}';`,
        `expect(data${index}).toBeDefined();`,
        `expect(ok${index}).toBeDefined();`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noInlineMultilineTestDataBench);
}
