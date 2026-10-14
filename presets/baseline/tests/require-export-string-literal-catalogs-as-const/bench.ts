import requireExportStringLiteralCatalogsAsConst from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/require-export-string-literal-catalogs-as-const.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

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
