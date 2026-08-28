import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';

import { playwrightConfigBench } from './bench.ts';

describe('playwright-config before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(playwrightConfigBench.rule);
    const context = createBenchRuleContext(playwrightConfigBench.ruleId);
    context.state.filename = '/bench/playwright.config.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });

  it('skips non-config files without scanning', () => {
    const createOnce = requireCreateOnceRule(playwrightConfigBench.rule);
    const context = createBenchRuleContext(playwrightConfigBench.ruleId);
    context.state.filename = '/bench/tests/e2e/visualizer.pw.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
    expect(context.state.reports).toEqual([]);
  });
});

describe('playwright-config reports', () => {
  it('reports missing baseURL and webServer on hot-incomplete-config', () => {
    const result = replayCreateOnceRule({
      ruleId: playwrightConfigBench.ruleId,
      rule: playwrightConfigBench.rule,
      cases: playwrightConfigBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(1);
    expect(reports[0]?.messageId).toBe('required');
  });

  it('allows a complete config', () => {
    const result = replayCreateOnceRule({
      ruleId: playwrightConfigBench.ruleId,
      rule: playwrightConfigBench.rule,
      cases: [
        {
          name: 'complete',
          filename: '/bench/playwright.config.ts',
          cwd: '/bench',
          code: 'export default { use: { baseURL: "http://localhost:3000" }, webServer: { command: "bun run dev", url: "http://localhost:3000" } };\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
