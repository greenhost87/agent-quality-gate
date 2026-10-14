import { describe } from 'bun:test';

import { describeRuleBenchReplay } from 'agent-quality-gate/internal/presets/baseline/tests/support/describe-rule-bench-replay.ts';
import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/baseline/tests/support/expect-typed-visitors.ts';

import { noIdentityAliasesBench } from './bench.ts';

describeRuleBenchReplay(noIdentityAliasesBench);

describe('no-identity-aliases visitors', () => {
  itRegistersTypedVisitors(noIdentityAliasesBench.rule, noIdentityAliasesBench.ruleId, [
    'VariableDeclaration',
  ]);
});
