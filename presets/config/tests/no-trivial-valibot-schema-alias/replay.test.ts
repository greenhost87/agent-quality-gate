import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';

import { noTrivialValibotSchemaAliasBench } from './bench.ts';

const nonEmptyPipeFixture = readFileSync(
  resolve(
    import.meta.dir,
    '../../.quality-fixtures/no-trivial-valibot-schema-alias/valid/non-empty-pipe/schema.ts',
  ),
  'utf8',
);

describe('no-trivial-valibot-schema-alias before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noTrivialValibotSchemaAliasBench.rule);
    const context = createBenchRuleContext(noTrivialValibotSchemaAliasBench.ruleId);
    context.state.filename = '/bench/system/config/schema.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-trivial-valibot-schema-alias reports', () => {
  it('reports once per exported trivial alias on hot-exported-aliases', () => {
    const result = replayCreateOnceRule({
      ruleId: noTrivialValibotSchemaAliasBench.ruleId,
      rule: noTrivialValibotSchemaAliasBench.rule,
      cases: noTrivialValibotSchemaAliasBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'trivialAlias')).toBe(true);
  });

  it('allows pipe schemas with constraints', () => {
    const result = replayCreateOnceRule({
      ruleId: noTrivialValibotSchemaAliasBench.ruleId,
      rule: noTrivialValibotSchemaAliasBench.rule,
      cases: [
        {
          name: 'non-empty-pipe',
          filename: '/bench/system/config/schema.ts',
          cwd: '/bench',
          code: nonEmptyPipeFixture,
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
