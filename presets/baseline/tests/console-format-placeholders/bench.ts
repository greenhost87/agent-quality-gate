import consoleFormatPlaceholders from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/console-format-placeholders.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const consoleFormatPlaceholdersBench: BenchCreateOnceRuleInput = {
  name: 'console-format-placeholders',
  ruleId: 'aqg/console-format-placeholders',
  rule: consoleFormatPlaceholders,
  cases: [
    {
      name: 'hot-mixed',
      filename: '/bench/console-format-placeholders.ts',
      code: repeat((index) => [
        `console.log('item %s %d', 'name-${index}', ${index});`,
        `console.debug(value${index});`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(consoleFormatPlaceholdersBench);
}
