import { describe, expect, it } from 'bun:test';

import {
  diagnosticFromOxlintJson,
  oxlintCodeToConfigRuleId,
  parseOxlintJsonOutput,
} from '../../execute-verify/oxlint-json.js';
import {
  filterIgnoredOxlintDiagnostics,
  selectFirstNonEmptyOxlintDiagnosticGroup,
} from '../../execute-verify/oxlint-diagnostics.js';
import type { Diagnostic } from '../../execute-verify/check-result.js';

describe('oxlint JSON adapter', () => {
  it('maps plugin(code) to config rule ids', () => {
    expect(oxlintCodeToConfigRuleId('eslint(no-debugger)')).toBe('no-debugger');
    expect(oxlintCodeToConfigRuleId('aqg(no-class)')).toBe('aqg/no-class');
    expect(oxlintCodeToConfigRuleId('database(dao-boundaries)')).toBe('database/dao-boundaries');
    expect(oxlintCodeToConfigRuleId('typescript(TS2322)')).toBe('typescript/TS2322');
  });

  it('parses diagnostics and keeps multiple labels', () => {
    const parsed = parseOxlintJsonOutput(
      JSON.stringify({
        diagnostics: [
          {
            message: 'duplicate condition',
            code: 'eslint(no-dupe-else-if)',
            severity: 'error',
            filename: 'src/a.ts',
            labels: [
              { span: { line: 2, column: 1 }, label: 'this condition' },
              { span: { line: 4, column: 3 }, label: 'is covered by' },
            ],
            help: 'remove the branch',
            url: 'https://example.test',
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const raw = parsed.output.diagnostics[0];
    expect(raw).toBeDefined();
    if (raw === undefined) {
      return;
    }
    const diagnostic = diagnosticFromOxlintJson(raw);
    expect(diagnostic?.ruleId).toBe('no-dupe-else-if');
    expect(diagnostic?.location?.line).toBe(2);
    expect(diagnostic?.related).toHaveLength(1);
    expect(diagnostic?.related?.[0]?.label).toBe('is covered by');
  });

  it('ignores and groups by ruleId field only, not message/filename text', () => {
    const diagnostics: Diagnostic[] = [
      {
        source: 'oxlint',
        ruleId: 'aqg/no-class',
        severity: 'error',
        message: 'mentions database/dao-boundaries in message',
        location: { path: 'src/database/dao-boundaries.ts', line: 1, column: 1 },
      },
      {
        source: 'oxlint',
        ruleId: 'database/dao-boundaries',
        severity: 'error',
        message: 'real boundary',
        location: { path: 'src/x.ts', line: 1, column: 1 },
      },
    ];
    const filtered = filterIgnoredOxlintDiagnostics(
      diagnostics,
      new Set(['database/dao-boundaries']),
    );
    expect(filtered.diagnostics).toHaveLength(1);
    expect(filtered.diagnostics[0]?.ruleId).toBe('aqg/no-class');

    const groups = [
      { id: 'boundaries:database', ruleIds: new Set(['database/dao-boundaries']) },
      { id: 'lint', ruleIds: new Set(['aqg/no-class']) },
    ];
    const selection = selectFirstNonEmptyOxlintDiagnosticGroup(filtered.diagnostics, groups);
    expect(selection.groupIndex).toBe(1);
    expect(selection.diagnostics[0]?.ruleId).toBe('aqg/no-class');
    expect(selection.deferredCount).toBe(0);
  });

  it('treats invalid JSON as a parse failure, not an empty pass', () => {
    const parsed = parseOxlintJsonOutput('{not-json');
    expect(parsed.ok).toBe(false);
  });
});
