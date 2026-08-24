import noManualExportedStringLiteralUnions from '../../oxlint/rules/no-manual-exported-string-literal-unions.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noManualExportedStringLiteralUnionsBench: BenchCreateOnceRuleInput = {
  name: 'no-manual-exported-string-literal-unions',
  ruleId: 'aqg/no-manual-exported-string-literal-unions',
  rule: noManualExportedStringLiteralUnions,
  cases: [
    {
      name: 'hot-unions',
      filename: '/bench/no-manual-exported-string-literal-unions.types.ts',
      code: repeat((index) => [
        `export type Mode${index} = 'a${index}' | 'b${index}' | 'c${index}';`,
        `export type Flag${index} = boolean;`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noManualExportedStringLiteralUnionsBench);
}
