import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

import { noInlineMultilineTestDataBench } from './bench.ts';

describeRuleBenchReplay(noInlineMultilineTestDataBench);

describe('no-inline-multiline-test-data reports', () => {
  it('reports once per newline join on hot-test-data', () => {
    const result = replayCreateOnceRule({
      ruleId: noInlineMultilineTestDataBench.ruleId,
      rule: noInlineMultilineTestDataBench.rule,
      cases: noInlineMultilineTestDataBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(120);
    expect(reports.every((report) => report.messageId === 'inlineData')).toBe(true);
  });

  it('reports the outer static concatenation once', () => {
    const result = replayCreateOnceRule({
      ruleId: noInlineMultilineTestDataBench.ruleId,
      rule: noInlineMultilineTestDataBench.rule,
      cases: [
        {
          name: 'static-concat',
          filename: '/bench/tests/static-concat.test.ts',
          code: readRuleFixture(import.meta.dir, 'static-concat.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports.length).toBe(1);
    expect(result.cases[0]?.reports[0]?.messageId).toBe('inlineData');
  });

  it('still reports a multiline literal inside a non-static join', () => {
    const result = replayCreateOnceRule({
      ruleId: noInlineMultilineTestDataBench.ruleId,
      rule: noInlineMultilineTestDataBench.rule,
      cases: [
        {
          name: 'dynamic-join',
          filename: '/bench/tests/dynamic-join.test.ts',
          code: readRuleFixture(import.meta.dir, 'dynamic-join.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports.length).toBe(1);
    expect(result.cases[0]?.reports[0]?.messageId).toBe('inlineData');
  });

  it('ignores single-line string data', () => {
    const result = replayCreateOnceRule({
      ruleId: noInlineMultilineTestDataBench.ruleId,
      rule: noInlineMultilineTestDataBench.rule,
      cases: [
        {
          name: 'one-line',
          filename: '/bench/tests/one-line.test.ts',
          code: readRuleFixture(import.meta.dir, 'one-line.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
