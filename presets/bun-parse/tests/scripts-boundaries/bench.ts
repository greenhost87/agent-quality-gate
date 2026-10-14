import { scriptsBoundaries } from 'agent-quality-gate/internal/presets/bun-parse/oxlint/scripts-boundaries.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const scriptsBoundariesBench: BenchCreateOnceRuleInput = {
  name: 'scripts-boundaries',
  ruleId: 'bun-parse/scripts-boundaries',
  rule: scriptsBoundaries,
  cases: [
    {
      name: 'hot-scripts-import',
      filename: '/bench/app/load.ts',
      cwd: '/bench',
      options: [{ scriptDirectories: ['scripts'] }],
      code: repeat((index) => [`import { helper${index} } from '@/scripts/helper${index}';`]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(scriptsBoundariesBench);
}
