import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { createBenchRuleContext } from 'agent-quality-gate/testing/oxlint';
import { requireCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/testing/oxlint';

import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/playwright/tests/support/expect-typed-visitors.ts';
import { e2eRunnerBench } from './bench.ts';

describe('e2e-runner visitors', () => {
  itRegistersTypedVisitors(e2eRunnerBench.rule, e2eRunnerBench.ruleId, [
    'Program',
    'ImportDeclaration',
    'CallExpression',
    'MemberExpression',
  ]);

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

  it('reports configured process-runner imports', () => {
    const result = replayCreateOnceRule({
      ruleId: e2eRunnerBench.ruleId,
      rule: e2eRunnerBench.rule,
      cases: [
        {
          name: 'configured-process-runner',
          filename: '/bench/specs/browser/app.pw.ts',
          cwd: '/bench',
          options: [{ e2eDirectory: 'specs/browser', processRunnerImports: ['execa'] }],
          code: "import { execa } from 'execa'; void execa;",
        },
      ],
    });
    expect(result.cases[0]?.reports[0]?.messageId).toBe('spawn');
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
          options: [{ e2eDirectory: 'tests/e2e' }],
          code: 'export const ok = true;\n',
        },
      ],
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.some((report) => report.messageId === 'filename')).toBe(true);
  });
});
