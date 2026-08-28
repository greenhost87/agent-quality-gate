import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { noRawJsonParseBench } from './bench.ts';

describe('no-raw-json-parse before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noRawJsonParseBench.rule);
    const context = createBenchRuleContext(noRawJsonParseBench.ruleId);
    context.state.filename = '/bench/utils.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-raw-json-parse reports', () => {
  it('reports once per hot JSON.parse call', () => {
    const result = replayCreateOnceRule({
      ruleId: noRawJsonParseBench.ruleId,
      rule: noRawJsonParseBench.rule,
      cases: noRawJsonParseBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'jsonParse')).toBe(true);
  });
});
