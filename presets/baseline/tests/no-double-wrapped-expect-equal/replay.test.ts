import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from '../support/hot-code.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

import { noDoubleWrappedExpectEqualBench } from './bench.ts';
describe('no-double-wrapped-expect-equal before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noDoubleWrappedExpectEqualBench.rule);
    const context = createBenchRuleContext(noDoubleWrappedExpectEqualBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-double-wrapped-expect-equal reports', () => {
  it('reports once per double-wrapped toEqual on hot-double-wraps', () => {
    const result = replayCreateOnceRule({
      ruleId: noDoubleWrappedExpectEqualBench.ruleId,
      rule: noDoubleWrappedExpectEqualBench.rule,
      cases: noDoubleWrappedExpectEqualBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'doubleWrapped')).toBe(true);
  });

  it('rejects the same helper on both sides and the same member call', () => {
    const result = replayCreateOnceRule({
      ruleId: noDoubleWrappedExpectEqualBench.ruleId,
      rule: noDoubleWrappedExpectEqualBench.rule,
      cases: [
        {
          name: 'double-wrap',
          filename: '/bench/double-wrap.test.ts',
          code: readRuleFixture(import.meta.dir, 'double-wrap.txt'),
        },
        {
          name: 'member-wrap',
          filename: '/bench/member-wrap.test.ts',
          code: readRuleFixture(import.meta.dir, 'member-wrap.txt'),
        },
      ],
    });
    const reports = result.cases[1]?.reports ?? [];
    expect((result.cases[0]?.reports ?? []).length).toBe(2);
    expect(reports.length).toBe(1);
    expect(reports.every((report) => report.messageId === 'doubleWrapped')).toBe(true);
  });

  it('allows one-sided normalization', () => {
    const result = replayCreateOnceRule({
      ruleId: noDoubleWrappedExpectEqualBench.ruleId,
      rule: noDoubleWrappedExpectEqualBench.rule,
      cases: [
        {
          name: 'one-sided',
          filename: '/bench/one-sided.test.ts',
          code: readRuleFixture(import.meta.dir, 'one-sided.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
