import requireExportStringLiteralCatalogsAsConst from '../../oxlint/rules/require-export-string-literal-catalogs-as-const.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const requireExportStringLiteralCatalogsAsConstBench: BenchCreateOnceRuleInput = {
  name: 'require-export-string-literal-catalogs-as-const',
  ruleId: 'aqg/require-export-string-literal-catalogs-as-const',
  rule: requireExportStringLiteralCatalogsAsConst,
  cases: [
    {
      name: 'hot-catalogs',
      filename: '/bench/require-export-string-literal-catalogs-as-const.ts',
      code: repeat((index) => [
        `export const values${index} = ['a${index}', 'b${index}'];`,
        `export const frozen${index} = ['a${index}', 'b${index}'] as const;`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(requireExportStringLiteralCatalogsAsConstBench);
}
