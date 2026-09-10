import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from '../support/hot-code.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

import { noWideParameterUnionsBench } from './bench.ts';
describe('no-wide-parameter-unions visitors', () => {
  itRegistersTypedVisitors(noWideParameterUnionsBench.rule, noWideParameterUnionsBench.ruleId, [
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression',
  ]);
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
