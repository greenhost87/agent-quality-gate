import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { noSkippedTestsBench } from './bench.ts';

describe('no-skipped-tests visitors', () => {
  itRegistersTypedVisitors(noSkippedTestsBench.rule, noSkippedTestsBench.ruleId, [
    'MemberExpression',
    'CallExpression',
  ]);
});

describe('no-skipped-tests reports', () => {
  it('reports once per skipped test on hot-skips', () => {
    const result = replayCreateOnceRule({
      ruleId: noSkippedTestsBench.ruleId,
      rule: noSkippedTestsBench.rule,
      cases: noSkippedTestsBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'removeSkip')).toBe(true);
  });

  it('reports only, skip, and x-prefixed forms', () => {
    const result = replayCreateOnceRule({
      ruleId: noSkippedTestsBench.ruleId,
      rule: noSkippedTestsBench.rule,
      cases: [
        {
          name: 'only',
          filename: '/bench/only.test.ts',
          code: "describe.only('suite', () => {});",
        },
        {
          name: 'skip',
          filename: '/bench/skip.test.ts',
          code: "it.skip('case', () => {});",
        },
        {
          name: 'xprefix',
          filename: '/bench/xprefix.test.ts',
          code: "xit('case', () => {});",
        },
      ],
    });
    expect(result.cases[0]?.reports.map((report) => report.messageId)).toEqual(['removeOnly']);
    expect(result.cases[1]?.reports.map((report) => report.messageId)).toEqual(['removeSkip']);
    expect(result.cases[2]?.reports.map((report) => report.messageId)).toEqual(['removeXPrefix']);
  });

  it('allows plain test calls', () => {
    const result = replayCreateOnceRule({
      ruleId: noSkippedTestsBench.ruleId,
      rule: noSkippedTestsBench.rule,
      cases: [
        {
          name: 'plain',
          filename: '/bench/plain.test.ts',
          code: "test('case', () => {});",
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
