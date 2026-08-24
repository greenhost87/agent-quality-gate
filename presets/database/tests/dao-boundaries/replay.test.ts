import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { daoBoundariesBench } from './bench.ts';

const daoSingletonFixture = readFileSync(
  join(import.meta.dir, 'fixtures/dao-singleton.ts.txt'),
  'utf8',
);

describe('dao-boundaries', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: daoBoundariesBench.ruleId,
      rule: daoBoundariesBench.rule,
      cases: daoBoundariesBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('dao-boundaries before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(daoBoundariesBench.rule);
    const context = createBenchRuleContext(daoBoundariesBench.ruleId);
    context.state.filename = '/bench/system/database/orders/orders.dao.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('dao-boundaries reports', () => {
  it('reports once per DAO construct on hot-dao-construct', () => {
    const result = replayCreateOnceRule({
      ruleId: daoBoundariesBench.ruleId,
      rule: daoBoundariesBench.rule,
      cases: daoBoundariesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'daoConstruct')).toBe(true);
  });

  it('allows exported singleton construction in production DAO files', () => {
    const result = replayCreateOnceRule({
      ruleId: daoBoundariesBench.ruleId,
      rule: daoBoundariesBench.rule,
      cases: [
        {
          name: 'dao-singleton',
          filename: '/bench/system/database/orders/orders.dao.ts',
          cwd: '/bench',
          code: daoSingletonFixture,
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
