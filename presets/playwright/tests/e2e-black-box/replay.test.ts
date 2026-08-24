import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { e2eBlackBoxBench } from './bench.ts';

describe('e2e-black-box', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: e2eBlackBoxBench.ruleId,
      rule: e2eBlackBoxBench.rule,
      cases: e2eBlackBoxBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('e2e-black-box before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(e2eBlackBoxBench.rule);
    const context = createBenchRuleContext(e2eBlackBoxBench.ruleId);
    context.state.filename = '/bench/tests/e2e/visualizer.pw.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });

  it('skips non-e2e files without scanning', () => {
    const createOnce = requireCreateOnceRule(e2eBlackBoxBench.rule);
    const context = createBenchRuleContext(e2eBlackBoxBench.ruleId);
    context.state.filename = '/bench/src/app.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
    expect(context.state.reports).toEqual([]);
  });
});

describe('e2e-black-box reports', () => {
  it('reports dao and database imports on hot-dao-and-database', () => {
    const result = replayCreateOnceRule({
      ruleId: e2eBlackBoxBench.ruleId,
      rule: e2eBlackBoxBench.rule,
      cases: e2eBlackBoxBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT * 2);
    expect(reports.filter((report) => report.messageId === 'dao').length).toBe(HOT);
    expect(reports.filter((report) => report.messageId === 'database').length).toBe(HOT);
  });
});
