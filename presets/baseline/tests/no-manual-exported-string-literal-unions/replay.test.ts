import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';
import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/baseline/tests/support/expect-typed-visitors.ts';

import { noManualExportedStringLiteralUnionsBench } from './bench.ts';
describe('no-manual-exported-string-literal-unions visitors', () => {
  itRegistersTypedVisitors(
    noManualExportedStringLiteralUnionsBench.rule,
    noManualExportedStringLiteralUnionsBench.ruleId,
    ['ExportNamedDeclaration'],
  );
});

describe('no-manual-exported-string-literal-unions reports', () => {
  it('reports once per manual string literal union on hot-unions', () => {
    const result = replayCreateOnceRule({
      ruleId: noManualExportedStringLiteralUnionsBench.ruleId,
      rule: noManualExportedStringLiteralUnionsBench.rule,
      cases: noManualExportedStringLiteralUnionsBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'manual')).toBe(true);
  });
});
