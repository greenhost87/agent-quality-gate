import { packageBoundaries } from 'agent-quality-gate/internal/presets/layout/oxlint/package-boundaries.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';

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
