import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from '../support/hot-code.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';

import { noUnknownParametersBench } from './bench.ts';
describe('no-unknown-parameters visitors', () => {
  itRegistersTypedVisitors(noUnknownParametersBench.rule, noUnknownParametersBench.ruleId, [
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression',
  ]);
});

describe('no-unknown-parameters reports', () => {
  it('reports once per unknown parameter on hot-unknown', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnknownParametersBench.ruleId,
      rule: noUnknownParametersBench.rule,
      cases: noUnknownParametersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'unknown')).toBe(true);
  });

  it('allows unknown in type-predicate parameters', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnknownParametersBench.ruleId,
      rule: noUnknownParametersBench.rule,
      cases: [
        {
          name: 'predicate',
          filename: '/bench/predicate.ts',
          code: 'export function isString(value: unknown): value is string { return typeof value === "string"; }\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('reports nested unknown inside parameter types', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnknownParametersBench.ruleId,
      rule: noUnknownParametersBench.rule,
      cases: [
        {
          name: 'nested',
          filename: '/bench/nested.ts',
          code: 'export function read(value: Array<unknown>): void { void value; }\n',
        },
      ],
    });
    expect(result.cases[0]?.reports.length).toBe(1);
  });
});
