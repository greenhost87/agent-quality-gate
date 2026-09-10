import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { noValibotCustomBench } from './bench.ts';

const structuralFixture = readFileSync(
  resolve(
    import.meta.dir,
    '../../.quality-fixtures/no-valibot-custom/valid/structural-schema/schema.ts',
  ),
  'utf8',
);

describe('no-valibot-custom visitors', () => {
  itRegistersTypedVisitors(noValibotCustomBench.rule, noValibotCustomBench.ruleId, [
    'CallExpression',
    'ImportDeclaration',
  ]);
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
