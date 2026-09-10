import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from '../support/hot-code.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';

import { consoleFormatPlaceholdersBench } from './bench.ts';
describe('console-format-placeholders visitors', () => {
  itRegistersTypedVisitors(
    consoleFormatPlaceholdersBench.rule,
    consoleFormatPlaceholdersBench.ruleId,
    ['CallExpression'],
  );
});

describe('console-format-placeholders reports', () => {
  it('reports once per dynamic console.debug call on hot-mixed', () => {
    const result = replayCreateOnceRule({
      ruleId: consoleFormatPlaceholdersBench.ruleId,
      rule: consoleFormatPlaceholdersBench.rule,
      cases: consoleFormatPlaceholdersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'dynamic')).toBe(true);
  });
});
