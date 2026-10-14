import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';
import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/baseline/tests/support/expect-typed-visitors.ts';

import { noUselessExportedTypeAliasesBench } from './bench.ts';
describe('no-useless-exported-type-aliases visitors', () => {
  itRegistersTypedVisitors(
    noUselessExportedTypeAliasesBench.rule,
    noUselessExportedTypeAliasesBench.ruleId,
    ['ExportNamedDeclaration'],
  );
});

describe('no-useless-exported-type-aliases reports', () => {
  it('reports once per useless exported alias on hot-aliases', () => {
    const result = replayCreateOnceRule({
      ruleId: noUselessExportedTypeAliasesBench.ruleId,
      rule: noUselessExportedTypeAliasesBench.rule,
      cases: noUselessExportedTypeAliasesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'uselessAlias')).toBe(true);
  });
});
