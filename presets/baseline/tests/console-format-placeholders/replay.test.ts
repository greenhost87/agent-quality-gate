import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from '../support/hot-code.ts';

import { consoleFormatPlaceholdersBench } from './bench.ts';
describe('console-format-placeholders before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(consoleFormatPlaceholdersBench.rule);
    const context = createBenchRuleContext(consoleFormatPlaceholdersBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
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
