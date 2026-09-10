import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';
import { noInterpolationInRegularStringBench } from './bench.ts';

describe('no-interpolation-in-regular-string visitors', () => {
  itRegistersTypedVisitors(
    noInterpolationInRegularStringBench.rule,
    noInterpolationInRegularStringBench.ruleId,
    ['Literal'],
  );
});

describe('no-interpolation-in-regular-string reports', () => {
  it('reports once per quoted interpolation on hot-interpolations', () => {
    const result = replayCreateOnceRule({
      ruleId: noInterpolationInRegularStringBench.ruleId,
      rule: noInterpolationInRegularStringBench.rule,
      cases: noInterpolationInRegularStringBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'useBackticks')).toBe(true);
  });

  it('allows backtick interpolation and plain values', () => {
    const result = replayCreateOnceRule({
      ruleId: noInterpolationInRegularStringBench.ruleId,
      rule: noInterpolationInRegularStringBench.rule,
      cases: [
        {
          name: 'backtick',
          filename: '/bench/backtick.ts',
          code: readRuleFixture(import.meta.dir, 'allowed-backtick.txt'),
        },
        {
          name: 'plain',
          filename: '/bench/plain.ts',
          code: "const plain = 'hello';",
        },
        {
          name: 'number',
          filename: '/bench/number.ts',
          code: 'const n = 1;',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
    expect(result.cases[1]?.reports).toEqual([]);
    expect(result.cases[2]?.reports).toEqual([]);
  });
});
