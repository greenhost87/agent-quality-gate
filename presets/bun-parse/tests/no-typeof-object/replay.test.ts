import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { noTypeofObjectBench } from './bench.ts';

describe('no-typeof-object before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noTypeofObjectBench.rule);
    const context = createBenchRuleContext(noTypeofObjectBench.ruleId);
    context.state.filename = '/bench/utils.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-typeof-object reports', () => {
  it('reports each plain-object recipe once', () => {
    const result = replayCreateOnceRule({
      ruleId: noTypeofObjectBench.ruleId,
      rule: noTypeofObjectBench.rule,
      cases: noTypeofObjectBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.filter((report) => report.messageId === 'plainObjectRecipe')).toHaveLength(HOT);
  });
});
