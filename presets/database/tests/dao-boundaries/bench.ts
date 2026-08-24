import { daoBoundaries } from '../../oxlint/dao-boundaries-rule.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

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
