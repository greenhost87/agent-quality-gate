import noDoubleWrappedExpectEqual from '../../oxlint/rules/no-double-wrapped-expect-equal.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noDoubleWrappedExpectEqualBench: BenchCreateOnceRuleInput = {
  name: 'no-double-wrapped-expect-equal',
  ruleId: 'aqg/no-double-wrapped-expect-equal',
  rule: noDoubleWrappedExpectEqual,
  cases: [
    {
      name: 'hot-double-wraps',
      filename: '/bench/no-double-wrapped-expect-equal.ts',
      code: repeat((index) => [
        `declare function normalize${index}(value: object): unknown;`,
        `declare function expected${index}(): object;`,
        `expect(normalize${index}(value${index})).toEqual(normalize${index}(expected${index}()));`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noDoubleWrappedExpectEqualBench);
}
