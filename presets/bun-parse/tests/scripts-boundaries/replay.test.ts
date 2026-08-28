import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { scriptsBoundariesBench } from './bench.ts';

describe('scripts-boundaries before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(scriptsBoundariesBench.rule);
    const context = createBenchRuleContext(scriptsBoundariesBench.ruleId);
    context.state.filename = '/bench/app/load.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });

  it('skips files under scripts/', () => {
    const createOnce = requireCreateOnceRule(scriptsBoundariesBench.rule);
    const context = createBenchRuleContext(scriptsBoundariesBench.ruleId);
    context.state.filename = '/bench/scripts/load-config.ts';
    context.state.cwd = '/bench';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('scripts-boundaries reports', () => {
  it('reports once per hot scripts import', () => {
    const result = replayCreateOnceRule({
      ruleId: scriptsBoundariesBench.ruleId,
      rule: scriptsBoundariesBench.rule,
      cases: scriptsBoundariesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'scriptsImport')).toBe(true);
  });
});
