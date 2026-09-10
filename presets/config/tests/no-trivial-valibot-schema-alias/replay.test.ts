import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { noTrivialValibotSchemaAliasBench } from './bench.ts';

const nonEmptyPipeFixture = readFileSync(
  resolve(
    import.meta.dir,
    '../../.quality-fixtures/no-trivial-valibot-schema-alias/valid/non-empty-pipe/schema.ts',
  ),
  'utf8',
);

describe('no-trivial-valibot-schema-alias visitors', () => {
  itRegistersTypedVisitors(
    noTrivialValibotSchemaAliasBench.rule,
    noTrivialValibotSchemaAliasBench.ruleId,
    ['ExportNamedDeclaration'],
  );
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
