import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from '../support/hot-code.ts';

import { noClassBench } from './bench.ts';
describe('no-class before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noClassBench.rule);
    const context = createBenchRuleContext(noClassBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-class reports', () => {
  it('reports once per banned class on hot-classes', () => {
    const result = replayCreateOnceRule({
      ruleId: noClassBench.ruleId,
      rule: noClassBench.rule,
      cases: noClassBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'forbidden')).toBe(true);
  });

  it('does not report when options are omitted', () => {
    const result = replayCreateOnceRule({
      ruleId: noClassBench.ruleId,
      rule: noClassBench.rule,
      cases: [
        {
          name: 'disabled',
          filename: '/bench/disabled.ts',
          code: 'export class HashCache {}\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
