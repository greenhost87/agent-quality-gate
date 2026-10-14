import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { createBenchRuleContext } from 'agent-quality-gate/testing/oxlint';
import { requireCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/testing/oxlint';

import { noTypeofObjectBench } from './bench.ts';

describe('no-typeof-object before scan', () => {
  it('scans files under tests/', () => {
    const createOnce = requireCreateOnceRule(noTypeofObjectBench.rule);
    const context = createBenchRuleContext(noTypeofObjectBench.ruleId);
    context.state.filename = '/bench/tests/utils.ts';
    context.state.code = 'typeof value === "object";\n';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBeUndefined();
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
