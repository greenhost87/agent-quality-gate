import { scriptsBoundaries } from '../../oxlint/scripts-boundaries.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const scriptsBoundariesBench: BenchCreateOnceRuleInput = {
  name: 'scripts-boundaries',
  ruleId: 'bun-parse/scripts-boundaries',
  rule: scriptsBoundaries,
  cases: [
    {
      name: 'hot-scripts-import',
      filename: '/bench/app/load.ts',
      cwd: '/bench',
      code: repeat((index) => [`import { helper${index} } from '@/scripts/helper${index}';`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(scriptsBoundariesBench);
}
