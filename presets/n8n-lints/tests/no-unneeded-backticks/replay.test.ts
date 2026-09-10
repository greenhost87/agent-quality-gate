import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';
import { noUnneededBackticksBench } from './bench.ts';

describe('no-unneeded-backticks visitors', () => {
  itRegistersTypedVisitors(noUnneededBackticksBench.rule, noUnneededBackticksBench.ruleId, [
    'TemplateLiteral',
  ]);
});

describe('no-unneeded-backticks reports', () => {
  it('reports once per plain backtick string on hot-backticks', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnneededBackticksBench.ruleId,
      rule: noUnneededBackticksBench.rule,
      cases: noUnneededBackticksBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'noUnneededBackticks')).toBe(true);
  });

  it('allows interpolation, multiline, tagged, and quoted strings', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnneededBackticksBench.ruleId,
      rule: noUnneededBackticksBench.rule,
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
});
