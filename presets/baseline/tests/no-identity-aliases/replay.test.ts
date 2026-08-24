import { describe, expect, it } from 'bun:test';

import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';

import { noIdentityAliasesBench } from './bench.ts';

describeRuleBenchReplay(noIdentityAliasesBench);

describe('no-identity-aliases before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noIdentityAliasesBench.rule);
    const context = createBenchRuleContext(noIdentityAliasesBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});
