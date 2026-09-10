import { describe, expect, it } from 'bun:test';

import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';
import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';

import { packageBoundariesBench } from './bench.ts';

describe('package-boundaries', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: packageBoundariesBench.ruleId,
      rule: packageBoundariesBench.rule,
      cases: packageBoundariesBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('package-boundaries before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(packageBoundariesBench.rule);
    const context = createBenchRuleContext(packageBoundariesBench.ruleId);
    context.state.filename = '/bench/orders/service.ts';
    context.state.cwd = '/bench';
    context.state.options = [{ declaredDependencies: { orders: ['system'] } }];
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('package-boundaries reports', () => {
  it('reports once per forbidden package import on hot-cross-package', () => {
    const result = replayCreateOnceRule({
      ruleId: packageBoundariesBench.ruleId,
      rule: packageBoundariesBench.rule,
      cases: packageBoundariesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'dependency')).toBe(true);
  });
});
