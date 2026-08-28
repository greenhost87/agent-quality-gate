import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from '../support/hot-code.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

import { noWideParameterUnionsBench } from './bench.ts';
describe('no-wide-parameter-unions before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noWideParameterUnionsBench.rule);
    const context = createBenchRuleContext(noWideParameterUnionsBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-wide-parameter-unions reports', () => {
  it('reports once per wide parameter union on hot-wide', () => {
    const result = replayCreateOnceRule({
      ruleId: noWideParameterUnionsBench.ruleId,
      rule: noWideParameterUnionsBench.rule,
      cases: noWideParameterUnionsBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'wideUnion')).toBe(true);
  });

  it('allows short and literal-only parameter unions', () => {
    const result = replayCreateOnceRule({
      ruleId: noWideParameterUnionsBench.ruleId,
      rule: noWideParameterUnionsBench.rule,
      cases: [
        {
          name: 'allowed',
          filename: '/bench/allowed.ts',
          code: readRuleFixture(import.meta.dir, 'allowed.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('reports wide non-literal unions and ignores non-parameter unions', () => {
    const result = replayCreateOnceRule({
      ruleId: noWideParameterUnionsBench.ruleId,
      rule: noWideParameterUnionsBench.rule,
      cases: [
        {
          name: 'shapes',
          filename: '/bench/shapes.ts',
          code: readRuleFixture(import.meta.dir, 'shapes.txt'),
        },
      ],
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(2);
    expect(reports.every((report) => report.messageId === 'wideUnion')).toBe(true);
  });
});
