import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { environmentBoundariesBench } from './bench.ts';

describe('environment-boundaries', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: environmentBoundariesBench.ruleId,
      rule: environmentBoundariesBench.rule,
      cases: environmentBoundariesBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('environment-boundaries before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(environmentBoundariesBench.rule);
    const context = createBenchRuleContext(environmentBoundariesBench.ruleId);
    context.state.filename = '/bench/system/orders/service.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('environment-boundaries reports', () => {
  it('reports once per process.env read on hot-process-env', () => {
    const result = replayCreateOnceRule({
      ruleId: environmentBoundariesBench.ruleId,
      rule: environmentBoundariesBench.rule,
      cases: environmentBoundariesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'environment')).toBe(true);
  });

  it('skips the environment module', () => {
    const result = replayCreateOnceRule({
      ruleId: environmentBoundariesBench.ruleId,
      rule: environmentBoundariesBench.rule,
      cases: [
        {
          name: 'env-module',
          filename: '/bench/system/config/environment.ts',
          cwd: '/bench',
          code: 'export const token = process.env.TOKEN;\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
