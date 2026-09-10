import { describe } from 'bun:test';

import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';

import { noIdentityAliasesBench } from './bench.ts';

describeRuleBenchReplay(noIdentityAliasesBench);

describe('no-identity-aliases visitors', () => {
  itRegistersTypedVisitors(noIdentityAliasesBench.rule, noIdentityAliasesBench.ruleId, [
    'VariableDeclaration',
  ]);
});
