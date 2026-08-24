import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';

import { noUnknownParametersBench } from './bench.ts';

describeRuleBenchReplay(noUnknownParametersBench);

describe('no-unknown-parameters before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noUnknownParametersBench.rule);
    const context = createBenchRuleContext(noUnknownParametersBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-unknown-parameters reports', () => {
  it('reports once per unknown parameter on hot-unknown', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnknownParametersBench.ruleId,
      rule: noUnknownParametersBench.rule,
      cases: noUnknownParametersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'unknown')).toBe(true);
  });

  it('allows unknown in type-predicate parameters', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnknownParametersBench.ruleId,
      rule: noUnknownParametersBench.rule,
      cases: [
        {
          name: 'predicate',
          filename: '/bench/predicate.ts',
          code: 'export function isString(value: unknown): value is string { return typeof value === "string"; }\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('reports nested unknown inside parameter types', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnknownParametersBench.ruleId,
      rule: noUnknownParametersBench.rule,
      cases: [
        {
          name: 'nested',
          filename: '/bench/nested.ts',
          code: 'export function read(value: Array<unknown>): void { void value; }\n',
        },
      ],
    });
    expect(result.cases[0]?.reports.length).toBe(1);
  });
});
