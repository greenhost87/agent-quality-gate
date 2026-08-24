import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';

import { noEmptyExtendedInterfacesBench } from './bench.ts';

describeRuleBenchReplay(noEmptyExtendedInterfacesBench);

describe('no-empty-extended-interfaces before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noEmptyExtendedInterfacesBench.rule);
    const context = createBenchRuleContext(noEmptyExtendedInterfacesBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-empty-extended-interfaces reports', () => {
  it('reports once per empty extended interface on hot-interfaces', () => {
    const result = replayCreateOnceRule({
      ruleId: noEmptyExtendedInterfacesBench.ruleId,
      rule: noEmptyExtendedInterfacesBench.rule,
      cases: noEmptyExtendedInterfacesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'emptyInterface')).toBe(true);
  });
});
