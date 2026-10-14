import { environmentBoundaries } from 'agent-quality-gate/internal/presets/config/oxlint/environment-boundaries.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const environmentBoundariesBench: BenchCreateOnceRuleInput = {
  name: 'environment-boundaries',
  ruleId: 'config/environment-boundaries',
  rule: environmentBoundaries,
  cases: [
    {
      name: 'hot-process-env',
      filename: '/bench/system/orders/service.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `const value${index} = process.env.TOKEN_${index};`,
        `export function read${index}(): string | undefined {`,
        `  return value${index};`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(environmentBoundariesBench);
}
