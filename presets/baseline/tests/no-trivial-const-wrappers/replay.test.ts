import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from '../support/hot-code.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';

import { noTrivialConstWrappersBench } from './bench.ts';
describe('no-trivial-const-wrappers visitors', () => {
  itRegistersTypedVisitors(noTrivialConstWrappersBench.rule, noTrivialConstWrappersBench.ruleId, [
    'Program',
    'CallExpression',
  ]);
});

describe('no-trivial-const-wrappers reports', () => {
  it('reports once per trivial const wrapper on hot-functions', () => {
    const result = replayCreateOnceRule({
      ruleId: noTrivialConstWrappersBench.ruleId,
      rule: noTrivialConstWrappersBench.rule,
      cases: noTrivialConstWrappersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'trivialConstWrapper')).toBe(true);
  });
});
