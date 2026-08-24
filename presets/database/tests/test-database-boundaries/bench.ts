import { testDatabaseBoundaries } from '../../oxlint/test-database-boundaries-rule.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const testDatabaseBoundariesBench: BenchCreateOnceRuleInput = {
  name: 'test-database-boundaries',
  ruleId: 'database/test-database-boundaries',
  rule: testDatabaseBoundaries,
  cases: [
    {
      name: 'hot-before-all-dao',
      filename: '/bench/tests/integration/orders.test.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `import { beforeAll } from 'bun:test';`,
        `import { useIsolatedTestDatabase } from '../setup/testDatabase';`,
        `import { ordersDao${index} } from '../../system/database/orders/orders.dao';`,
        `useIsolatedTestDatabase();`,
        `beforeAll(() => { ordersDao${index}.find(${index}); });`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(testDatabaseBoundariesBench);
}
