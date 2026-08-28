import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from '../support/hot-code.ts';

import { noTrivialConstWrappersBench } from './bench.ts';
describe('no-trivial-const-wrappers before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noTrivialConstWrappersBench.rule);
    const context = createBenchRuleContext(noTrivialConstWrappersBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-trivial-const-wrappers reports', () => {
  it('reports once per trivial const wrapper on hot-functions', () => {
    const result = replayCreateOnceRule({
      ruleId: noTrivialConstWrappersBench.ruleId,
      rule: noTrivialConstWrappersBench.rule,
      cases: noTrivialConstWrappersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'trivialConstWrapper')).toBe(true);
  });
});
