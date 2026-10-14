import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';
import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/baseline/tests/support/expect-typed-visitors.ts';
import { readRuleFixture } from 'agent-quality-gate/internal/presets/baseline/tests/support/read-rule-fixture.ts';

import { noMixedNullishTypesBench } from './bench.ts';

describe('no-mixed-nullish-types visitors', () => {
  itRegistersTypedVisitors(noMixedNullishTypesBench.rule, noMixedNullishTypesBench.ruleId, [
    'TSUnionType:exit',
    'TSParenthesizedType:exit',
    'TSTypeAnnotation:exit',
    'TSOptionalType:exit',
    'TSNamedTupleMember:exit',
  ]);
});

describe('no-mixed-nullish-types reports', () => {
  it('reports once per mixed parameter on hot-params', () => {
    const result = replayCreateOnceRule(noMixedNullishTypesBench);
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'mixedNullish')).toBe(true);
  });

  it('allows single absence forms', () => {
    const result = replayCreateOnceRule({
      ...noMixedNullishTypesBench,
      cases: [
        {
          name: 'allowed',
          filename: '/bench/allowed.ts',
          code: readRuleFixture(import.meta.dir, 'allowed.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('reports aliases and inline nested unions as well as parameters', () => {
    const result = replayCreateOnceRule({
      ...noMixedNullishTypesBench,
      cases: [
        {
          name: 'shapes',
          filename: '/bench/shapes.ts',
          code: readRuleFixture(import.meta.dir, 'shapes.txt'),
        },
      ],
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(4);
    expect(reports.every((report) => report.messageId === 'mixedNullish')).toBe(true);
  });
});
