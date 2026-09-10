import noJsonParseJsonStringify from '../../oxlint/rules/no-json-parse-json-stringify.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

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
