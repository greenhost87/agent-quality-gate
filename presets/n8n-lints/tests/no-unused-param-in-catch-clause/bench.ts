import { noUnusedParamInCatchClause } from 'agent-quality-gate/internal/presets/n8n-lints/oxlint/no-unused-param-in-catch-clause.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/testing/oxlint';

export const noUnusedParamInCatchClauseBench: BenchCreateOnceRuleInput = {
  name: 'no-unused-param-in-catch-clause',
  ruleId: 'n8n-lints/no-unused-param-in-catch-clause',
  rule: noUnusedParamInCatchClause,
  cases: [
    {
      name: 'hot-unused',
      filename: '/bench/unused.ts',
      code: repeat((index) => [
        `try { run${index}(); } catch (error${index}) { report${index}('failed'); }`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noUnusedParamInCatchClauseBench);
}
