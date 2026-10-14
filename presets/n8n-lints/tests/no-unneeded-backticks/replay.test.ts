import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/testing/oxlint';

import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/n8n-lints/tests/support/expect-typed-visitors.ts';
import { readRuleFixture } from 'agent-quality-gate/internal/presets/n8n-lints/tests/support/read-rule-fixture.ts';
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
