import noDynamicImport from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-dynamic-import.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noDynamicImportBench: BenchCreateOnceRuleInput = {
  name: 'no-dynamic-import',
  ruleId: 'aqg/no-dynamic-import',
  rule: noDynamicImport,
  cases: [
    {
      name: 'dynamic-imports',
      filename: '/bench/src/module.ts',
      code: repeat((index) => [`void import('./module-${index}.ts');`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noDynamicImportBench);
}
