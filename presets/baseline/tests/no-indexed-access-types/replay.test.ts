import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from '../support/hot-code.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

import { noIndexedAccessTypesBench } from './bench.ts';
describe('no-indexed-access-types before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noIndexedAccessTypesBench.rule);
    const context = createBenchRuleContext(noIndexedAccessTypesBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-indexed-access-types reports', () => {
  it('reports once per indexed access on hot-indexed', () => {
    const result = replayCreateOnceRule({
      ruleId: noIndexedAccessTypesBench.ruleId,
      rule: noIndexedAccessTypesBench.rule,
      cases: noIndexedAccessTypesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT * 2);
    expect(reports.every((report) => report.messageId === 'forbidden')).toBe(true);
  });

  it('allows (typeof identifier)[number]', () => {
    const result = replayCreateOnceRule({
      ruleId: noIndexedAccessTypesBench.ruleId,
      rule: noIndexedAccessTypesBench.rule,
      cases: [
        {
          name: 'runtime-element',
          filename: '/bench/runtime-element.types.ts',
          code: readRuleFixture(import.meta.dir, 'runtime-element.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('still reports other indexed access shapes', () => {
    const result = replayCreateOnceRule({
      ruleId: noIndexedAccessTypesBench.ruleId,
      rule: noIndexedAccessTypesBench.rule,
      cases: [
        {
          name: 'other-shapes',
          filename: '/bench/other-shapes.types.ts',
          code: readRuleFixture(import.meta.dir, 'other-shapes.txt'),
        },
      ],
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(3);
    expect(reports.every((report) => report.messageId === 'forbidden')).toBe(true);
  });
});
