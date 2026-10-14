import noJsonParseJsonStringify from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-json-parse-json-stringify.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noJsonParseJsonStringifyBench: BenchCreateOnceRuleInput = {
  name: 'no-json-parse-json-stringify',
  ruleId: 'aqg/no-json-parse-json-stringify',
  rule: noJsonParseJsonStringify,
  cases: [
    {
      name: 'hot-copies',
      filename: '/bench/copies.ts',
      code: repeat((index) => [`const copy${index} = JSON.parse(JSON.stringify(value${index}));`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noJsonParseJsonStringifyBench);
}
