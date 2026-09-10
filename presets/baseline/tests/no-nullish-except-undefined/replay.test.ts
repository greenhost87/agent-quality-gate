import { expect, test } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import rule from '../../oxlint/rules/no-nullish-except-undefined.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

test('allows standalone void returns and asynchronous results', () => {
  const result = replayCreateOnceRule({
    name: 'no-nullish-except-undefined',
    ruleId: 'aqg/no-nullish-except-undefined',
    rule,
    cases: [
      {
        name: 'returns',
        filename: '/bench/returns.ts',
        code: readRuleFixture(import.meta.dir, 'returns.txt'),
      },
    ],
  });
  expect(result.cases[0]?.reports).toEqual([]);
});

test('rejects void values and unions without relaxing null or optional forms', () => {
  const result = replayCreateOnceRule({
    name: 'no-nullish-except-undefined',
    ruleId: 'aqg/no-nullish-except-undefined',
    rule,
    cases: [
      {
        name: 'invalid',
        filename: '/bench/invalid.ts',
        code: readRuleFixture(import.meta.dir, 'invalid.txt'),
      },
    ],
  });
  const reports = result.cases[0]?.reports ?? [];
  expect(reports).toHaveLength(12);
  expect(reports.every((report) => report.messageId === 'nonUndefinedAbsence')).toBe(true);
});
