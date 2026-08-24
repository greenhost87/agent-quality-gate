import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';

import { noThinForwardersBench } from './bench.ts';

describeRuleBenchReplay(noThinForwardersBench);

describe('no-thin-forwarders before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noThinForwardersBench.rule);
    const context = createBenchRuleContext(noThinForwardersBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-thin-forwarders reports', () => {
  it('reports once per thin forwarder on hot-functions', () => {
    const result = replayCreateOnceRule({
      ruleId: noThinForwardersBench.ruleId,
      rule: noThinForwardersBench.rule,
      cases: noThinForwardersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'thinForwarder')).toBe(true);
  });
});
