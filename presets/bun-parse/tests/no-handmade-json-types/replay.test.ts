import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { noHandmadeJsonTypesBench } from './bench.ts';

const bunValibotFixture = readFileSync(
  resolve(
    import.meta.dir,
    '../../.quality-fixtures/no-handmade-json-types/valid/bun-valibot/schema.ts',
  ),
  'utf8',
);

describe('no-handmade-json-types reports', () => {
  it('reports each recursive JSON type once', () => {
    const result = replayCreateOnceRule({
      ruleId: noHandmadeJsonTypesBench.ruleId,
      rule: noHandmadeJsonTypesBench.rule,
      cases: noHandmadeJsonTypesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    // TreeValue + TreeObject per hot item; no-typeof-object owns the guard.
    expect(reports.length).toBe(HOT * 2);
    const typeReports = reports.filter((report) => report.messageId === 'handmadeType');
    expect(typeReports.length).toBe(HOT * 2);
  });

  it('allows Bun + valibot InferOutput without handmade JSON types', () => {
    const result = replayCreateOnceRule({
      ruleId: noHandmadeJsonTypesBench.ruleId,
      rule: noHandmadeJsonTypesBench.rule,
      cases: [
        {
          name: 'bun-valibot',
          filename: '/bench/system/config/schema.ts',
          cwd: '/bench',
          code: bunValibotFixture,
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
