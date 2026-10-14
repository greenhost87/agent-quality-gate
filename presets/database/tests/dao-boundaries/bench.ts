import { daoBoundaries } from 'agent-quality-gate/internal/presets/database/oxlint/dao-boundaries-rule.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const daoBoundariesBench: BenchCreateOnceRuleInput = {
  name: 'dao-boundaries',
  ruleId: 'database/dao-boundaries',
  rule: daoBoundaries,
  cases: [
    {
      name: 'hot-dao-construct',
      filename: '/bench/system/orders/service.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `class Order${index}Dao {}`,
        `export const dao${index} = new Order${index}Dao();`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(daoBoundariesBench);
}
