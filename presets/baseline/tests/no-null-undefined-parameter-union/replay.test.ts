import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

import { noNullUndefinedParameterUnionBench } from './bench.ts';

describeRuleBenchReplay(noNullUndefinedParameterUnionBench);

describe('no-null-undefined-parameter-union before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noNullUndefinedParameterUnionBench.rule);
    const context = createBenchRuleContext(noNullUndefinedParameterUnionBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-null-undefined-parameter-union reports', () => {
  it('reports once per null|undefined parameter union on hot-params', () => {
    const result = replayCreateOnceRule({
      ruleId: noNullUndefinedParameterUnionBench.ruleId,
      rule: noNullUndefinedParameterUnionBench.rule,
      cases: noNullUndefinedParameterUnionBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'nullUndefined')).toBe(true);
  });

  it('allows null-only or undefined-only parameter unions', () => {
    const result = replayCreateOnceRule({
      ruleId: noNullUndefinedParameterUnionBench.ruleId,
      rule: noNullUndefinedParameterUnionBench.rule,
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

  it('reports combined null|undefined params and ignores non-parameter unions', () => {
    const result = replayCreateOnceRule({
      ruleId: noNullUndefinedParameterUnionBench.ruleId,
      rule: noNullUndefinedParameterUnionBench.rule,
      cases: [
        {
          name: 'shapes',
          filename: '/bench/shapes.ts',
          code: readRuleFixture(import.meta.dir, 'shapes.txt'),
        },
      ],
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(2);
    expect(reports.every((report) => report.messageId === 'nullUndefined')).toBe(true);
  });
});
