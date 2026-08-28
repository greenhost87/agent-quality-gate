import noClass from '../../oxlint/rules/no-class.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noClassBench: BenchCreateOnceRuleInput = {
  name: 'no-class',
  ruleId: 'aqg/no-class',
  rule: noClass,
  cases: [
    {
      name: 'hot-classes',
      filename: '/bench/no-class.ts',
      options: [{ suffixes: ['Error', 'Element'] }],
      code: repeat((index) => [
        `class HashCache${index} {`,
        `  get(key: string): string | undefined {`,
        `    return key;`,
        `  }`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noClassBench);
}
