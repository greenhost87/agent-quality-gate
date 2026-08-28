import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from '../support/hot-code.ts';

import { readRuleFixture } from '../support/read-rule-fixture.ts';

import { maxInlineParameterObjectMembersBench } from './bench.ts';
describe('max-inline-parameter-object-members before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(maxInlineParameterObjectMembersBench.rule);
    const context = createBenchRuleContext(maxInlineParameterObjectMembersBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('max-inline-parameter-object-members reports', () => {
  it('reports once per wide inline parameter object when max is 3', () => {
    const result = replayCreateOnceRule({
      ruleId: maxInlineParameterObjectMembersBench.ruleId,
      rule: maxInlineParameterObjectMembersBench.rule,
      cases: maxInlineParameterObjectMembersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'tooManyMembers')).toBe(true);
  });

  it('does not report when options are omitted', () => {
    const result = replayCreateOnceRule({
      ruleId: maxInlineParameterObjectMembersBench.ruleId,
      rule: maxInlineParameterObjectMembersBench.rule,
      cases: [
        {
          name: 'default-off',
          filename: '/bench/default-off.ts',
          code: 'export function run(options: { a: string; b: string; c: string; d: string }): void { void options; }\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('does not report when max is -1', () => {
    const result = replayCreateOnceRule({
      ruleId: maxInlineParameterObjectMembersBench.ruleId,
      rule: maxInlineParameterObjectMembersBench.rule,
      cases: [
        {
          name: 'disabled',
          filename: '/bench/disabled.ts',
          options: [{ max: -1 }],
          code: 'export function run(options: { a: string; b: string; c: string; d: string }): void { void options; }\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('allows named parameter types and reports destructured and defaulted inline objects', () => {
    const result = replayCreateOnceRule({
      ruleId: maxInlineParameterObjectMembersBench.ruleId,
      rule: maxInlineParameterObjectMembersBench.rule,
      cases: [
        {
          name: 'shapes',
          filename: '/bench/shapes.ts',
          options: [{ max: 3 }],
          code: readRuleFixture(import.meta.dir, 'shapes.txt'),
        },
      ],
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(2);
    expect(reports.every((report) => report.messageId === 'tooManyMembers')).toBe(true);
  });
});
