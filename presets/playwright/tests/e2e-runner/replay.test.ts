import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { e2eRunnerBench } from './bench.ts';

describe('e2e-runner', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: e2eRunnerBench.ruleId,
      rule: e2eRunnerBench.rule,
      cases: e2eRunnerBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('e2e-runner before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(e2eRunnerBench.rule);
    const context = createBenchRuleContext(e2eRunnerBench.ruleId);
    context.state.filename = '/bench/tests/e2e/visualizer.pw.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });

  it('skips non-e2e files without scanning', () => {
    const createOnce = requireCreateOnceRule(e2eRunnerBench.rule);
    const context = createBenchRuleContext(e2eRunnerBench.ruleId);
    context.state.filename = '/bench/src/app.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
    expect(context.state.reports).toEqual([]);
  });
});

describe('e2e-runner reports', () => {
  it('reports bun:test and launch violations on hot-bun-test-and-launch', () => {
    const result = replayCreateOnceRule({
      ruleId: e2eRunnerBench.ruleId,
      rule: e2eRunnerBench.rule,
      cases: e2eRunnerBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT * 2);
    expect(reports.filter((report) => report.messageId === 'bunTest').length).toBe(HOT);
    expect(reports.filter((report) => report.messageId === 'launch').length).toBe(HOT);
  });

  it('reports invalid e2e filenames', () => {
    const result = replayCreateOnceRule({
      ruleId: e2eRunnerBench.ruleId,
      rule: e2eRunnerBench.rule,
      cases: [
        {
          name: 'bad-filename',
          filename: '/bench/tests/e2e/visualizer.test.ts',
          cwd: '/bench',
          code: 'export const ok = true;\n',
        },
      ],
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.some((report) => report.messageId === 'filename')).toBe(true);
  });
});
