import noDynamicImport from '../../oxlint/rules/no-dynamic-import.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

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
