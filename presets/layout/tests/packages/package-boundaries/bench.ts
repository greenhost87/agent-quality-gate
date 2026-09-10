import { packageBoundaries } from '../../../oxlint/package-boundaries.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';

export const packageBoundariesBench: BenchCreateOnceRuleInput = {
  name: 'package-boundaries',
  ruleId: 'packages/package-boundaries',
  rule: packageBoundaries,
  cases: [
    {
      name: 'hot-cross-package',
      filename: '/bench/orders/service.ts',
      cwd: '/bench',
      options: [
        {
          declaredDependencies: {
            orders: ['system'],
          },
        },
      ],
      code: repeat((index) => [
        `import { helper${index} } from '@/billing/helper${index}';`,
        `export function run${index}(): void {}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(packageBoundariesBench);
}
