import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';

import { noValibotCustomBench } from './bench.ts';

const structuralFixture = readFileSync(
  resolve(
    import.meta.dir,
    '../../.quality-fixtures/no-valibot-custom/valid/structural-schema/schema.ts',
  ),
  'utf8',
);

describe('no-valibot-custom before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noValibotCustomBench.rule);
    const context = createBenchRuleContext(noValibotCustomBench.ruleId);
    context.state.filename = '/bench/system/config/schema.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-valibot-custom reports', () => {
  it('reports once per v.custom call on hot-custom-calls', () => {
    const result = replayCreateOnceRule({
      ruleId: noValibotCustomBench.ruleId,
      rule: noValibotCustomBench.rule,
      cases: noValibotCustomBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'custom')).toBe(true);
  });

  it('allows structural schemas without custom', () => {
    const result = replayCreateOnceRule({
      ruleId: noValibotCustomBench.ruleId,
      rule: noValibotCustomBench.rule,
      cases: [
        {
          name: 'structural',
          filename: '/bench/system/config/schema.ts',
          cwd: '/bench',
          code: structuralFixture,
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
