import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from '../support/hot-code.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';

import { requireExportStringLiteralCatalogsAsConstBench } from './bench.ts';
describe('require-export-string-literal-catalogs-as-const visitors', () => {
  itRegistersTypedVisitors(
    requireExportStringLiteralCatalogsAsConstBench.rule,
    requireExportStringLiteralCatalogsAsConstBench.ruleId,
    ['ExportNamedDeclaration'],
  );
});

describe('require-export-string-literal-catalogs-as-const reports', () => {
  it('reports once per non-const catalog on hot-catalogs', () => {
    const result = replayCreateOnceRule({
      ruleId: requireExportStringLiteralCatalogsAsConstBench.ruleId,
      rule: requireExportStringLiteralCatalogsAsConstBench.rule,
      cases: requireExportStringLiteralCatalogsAsConstBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'invalid')).toBe(true);
  });
});
