import { playwrightPlugin } from '../../oxlint/playwright.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const e2eBlackBoxBench: BenchCreateOnceRuleInput = {
  name: 'e2e-black-box',
  ruleId: 'playwright/e2e-black-box',
  rule: playwrightPlugin.rules['e2e-black-box'],
  cases: [
    {
      name: 'hot-dao-and-database',
      filename: '/bench/tests/e2e/visualizer.pw.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `import { user${index} } from '../../modules/user.dao.ts';`,
        `import { db${index} } from 'system/database/client';`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(e2eBlackBoxBench);
}
