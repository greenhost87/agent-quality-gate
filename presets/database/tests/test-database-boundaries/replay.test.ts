import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { testDatabaseBoundariesBench } from './bench.ts';

const beforeAllUnmanagedFixture = readFileSync(
  join(import.meta.dir, 'fixtures/before-all-unmanaged.ts.txt'),
  'utf8',
);

describe('test-database-boundaries', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: testDatabaseBoundariesBench.ruleId,
      rule: testDatabaseBoundariesBench.rule,
      cases: testDatabaseBoundariesBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('test-database-boundaries before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(testDatabaseBoundariesBench.rule);
    const context = createBenchRuleContext(testDatabaseBoundariesBench.ruleId);
    context.state.filename = '/bench/tests/integration/orders.test.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('test-database-boundaries reports', () => {
  it('reports once per beforeAll DAO use on hot-before-all-dao', () => {
    const result = replayCreateOnceRule({
      ruleId: testDatabaseBoundariesBench.ruleId,
      rule: testDatabaseBoundariesBench.rule,
      cases: testDatabaseBoundariesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'beforeAllDao')).toBe(true);
  });

  it('allows beforeAll when the managed hook is not used', () => {
    const result = replayCreateOnceRule({
      ruleId: testDatabaseBoundariesBench.ruleId,
      rule: testDatabaseBoundariesBench.rule,
      cases: [
        {
          name: 'before-all-unmanaged',
          filename: '/bench/tests/integration/orders.test.ts',
          cwd: '/bench',
          code: beforeAllUnmanagedFixture,
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
