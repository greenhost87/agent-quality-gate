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

describe('no-handmade-json-types', () => {
  it('replays createOnce bench cases without throwing', () => {
    const result = replayCreateOnceRule({
      ruleId: noHandmadeJsonTypesBench.ruleId,
      rule: noHandmadeJsonTypesBench.rule,
      cases: noHandmadeJsonTypesBench.cases,
    });
    expect(result.cases.length).toBe(1);
    expect(Array.isArray(result.cases[0]?.reports)).toBe(true);
  });
});

describe('no-handmade-json-types reports', () => {
  it('reports type and guard once per hot recursive JSON union', () => {
    const result = replayCreateOnceRule({
      ruleId: noHandmadeJsonTypesBench.ruleId,
      rule: noHandmadeJsonTypesBench.rule,
      cases: noHandmadeJsonTypesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    // TreeValue + TreeObject + isTreeObject per hot item
    expect(reports.length).toBe(HOT * 3);
    const typeReports = reports.filter((report) => report.messageId === 'handmadeType');
    const guardReports = reports.filter((report) => report.messageId === 'handmadeGuard');
    expect(typeReports.length).toBe(HOT * 2);
    expect(guardReports.length).toBe(HOT);
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
