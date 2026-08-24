import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';

import { modulePlacementBench } from './bench.ts';

describe('module-placement', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: modulePlacementBench.ruleId,
      rule: modulePlacementBench.rule,
      cases: modulePlacementBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('module-placement before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(modulePlacementBench.rule);
    const context = createBenchRuleContext(modulePlacementBench.ruleId);
    context.state.filename = '/bench/system/orders.ts';
    context.state.options = [{ directories: ['system'], rootExceptions: {} }];
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('module-placement reports', () => {
  it('reports once for a misplaced module on hot-misplaced', () => {
    const result = replayCreateOnceRule({
      ruleId: modulePlacementBench.ruleId,
      rule: modulePlacementBench.rule,
      cases: modulePlacementBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(1);
    expect(reports[0]?.messageId).toBe('placement');
  });

  it('allows nested concern placement', () => {
    const result = replayCreateOnceRule({
      ruleId: modulePlacementBench.ruleId,
      rule: modulePlacementBench.rule,
      cases: [
        {
          name: 'nested',
          filename: '/bench/system/orders/service.ts',
          cwd: '/bench',
          options: [{ directories: ['system'], rootExceptions: {} }],
          code: 'export function run(): void {}\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
