import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { modulePlacementBench } from './bench.ts';

describe('module-placement visitors', () => {
  itRegistersTypedVisitors(
    modulePlacementBench.rule,
    modulePlacementBench.ruleId,
    ['Program'],
    [{ directories: ['system'], rootExceptions: {} }],
  );

  it('skips when directories are empty', () => {
    const createOnce = requireCreateOnceRule(modulePlacementBench.rule);
    const context = createBenchRuleContext(modulePlacementBench.ruleId);
    context.state.filename = '/bench/system/orders.ts';
    context.state.options = [{ directories: [], rootExceptions: {} }];
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
    expect(context.state.reports).toEqual([]);
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
