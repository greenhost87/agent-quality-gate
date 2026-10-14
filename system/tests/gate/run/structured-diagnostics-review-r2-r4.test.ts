import { describe, expect, it } from 'bun:test';

import {
  checkResultFromFallowCyclesToolRun,
  checkResultFromFallowHygieneToolRun,
} from '#system/gate/run/fallow/json-diagnostics.ts';
import { checkResultFromOxlintToolRun } from '#system/gate/run/verify-tool-run.ts';
import { ignoredOxlintCheckResult } from './verify-phases-helpers.js';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '#system/gate/quality-gate-run/present-diagnostics.ts';

describe('structured diagnostics review regressions R2-R4', () => {
  for (const scenario of [
    {
      title: 'R2: ignoring findings must preserve an execution failure',
      diagnostics: [
        { message: 'lint', code: 'eslint(no-debugger)', severity: 'warning', filename: 'src/a.ts' },
      ],
      retainedRule: undefined,
    },
    {
      title: 'R2: partial ignore keeps remaining diagnostics and accompanying execution failure',
      diagnostics: [
        {
          message: 'ignored',
          code: 'eslint(no-debugger)',
          severity: 'warning',
          filename: 'src/a.ts',
        },
        {
          message: 'kept',
          code: 'eslint(no-unused-vars)',
          severity: 'error',
          filename: 'src/b.ts',
        },
      ],
      retainedRule: 'no-unused-vars',
    },
  ] as const) {
    it(scenario.title, () => {
      const result = ignoredOxlintCheckResult(2, scenario.diagnostics, 'fatal tool failure');
      expect(result.exitCode).not.toBe(0);
      expect(result.failures?.[0]?.message).toContain('fatal tool failure');
      if (scenario.retainedRule !== undefined) {
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]?.ruleId).toBe(scenario.retainedRule);
      }
    });
  }

  it('R2: empty stdout with crash exit stays an execution failure', () => {
    const result = checkResultFromOxlintToolRun(
      { exitCode: 2, stdout: '', stderr: 'boom' },
      new Set(),
    );
    expect(result.exitCode).toBe(2);
    expect(result.failures?.[0]?.message).toContain('boom');
  });

  it('R2: empty diagnostics with crash exit and stderr stays an execution failure', () => {
    const result = checkResultFromOxlintToolRun(
      {
        exitCode: 2,
        stdout: JSON.stringify({ diagnostics: [] }),
        stderr: 'fatal tool failure',
      },
      new Set(['no-debugger']),
    );
    expect(result.exitCode).toBe(2);
    expect(result.failures?.[0]?.message).toContain('fatal tool failure');
  });

  it('R3: grouped diagnostics preserve related labels and omit help', () => {
    const text = renderDiagnosticBlocks(
      groupDiagnosticsForPresentation(
        ['a', 'b'].map((name) => ({
          source: 'oxlint',
          ruleId: 'test',
          severity: 'error' as const,
          message: 'duplicate',
          help: 'preserve help',
          location: { path: `${name}.ts`, line: 1 },
          related: [{ path: `${name}-related.ts`, line: 2, label: 'related label' }],
        })),
      ),
    );
    expect(text).not.toContain('preserve help');
    expect(text).toContain('a-related.ts');
    expect(text).toContain('related label');
  });

  it('R3: different source/rule with the same groupHeader stay separate', () => {
    const text = renderDiagnosticBlocks(
      groupDiagnosticsForPresentation([
        {
          source: 'fallow',
          ruleId: 'code-duplication',
          severity: 'error',
          message: 'dup a',
          location: { path: 'a.ts', line: 1 },
          groupHeader: 'shared-header',
        },
        {
          source: 'oxlint',
          ruleId: 'other',
          severity: 'error',
          message: 'dup b',
          location: { path: 'b.ts', line: 1 },
          groupHeader: 'shared-header',
        },
      ]),
    );
    expect(text).toContain('dup a');
    expect(text).toContain('dup b');
  });

  it('R3: shared-location unique reason is preserved', () => {
    const text = renderDiagnosticBlocks(
      groupDiagnosticsForPresentation([
        {
          source: 'fallow',
          ruleId: 'sample/ownership',
          severity: 'error',
          message: 'unique reason text for this module',
          location: { path: 'src/only.ts', line: 1 },
          related: [{ path: 'src/owner.ts', role: 'importer' }],
          groupHeader: 'owner',
          groupLocation: { path: 'src/owner.ts' },
        },
      ]),
    );
    expect(text).toContain('owner src/owner.ts');
    expect(text).toContain('unique reason text for this module');
  });

  it('R3: message that is a substring of groupHeader is still rendered', () => {
    const text = renderDiagnosticBlocks(
      groupDiagnosticsForPresentation([
        {
          source: 'layout',
          ruleId: 'layout/placement',
          severity: 'error',
          message: 'per-directory limit 12 under app/components',
          location: { path: 'app/components/features/fabrics' },
          groupHeader:
            'layout/placement: per-directory limit 12 under app/components; split the directory',
        },
      ]),
    );
    expect(text).toContain('layout/placement: per-directory limit 12 under app/components');
    expect(text).toContain('  per-directory limit 12 under app/components');
  });

  for (const scenario of [
    {
      title: 'R4: unrecognized Fallow JSON cannot pass',
      check: () =>
        checkResultFromFallowCyclesToolRun({
          exitCode: 1,
          stdout: JSON.stringify({ unexpected: true }),
          stderr: '',
        }),
    },
    {
      title: 'R4: dead-code with total_issues but no known findings cannot pass',
      check: () =>
        checkResultFromFallowCyclesToolRun({
          exitCode: 1,
          stdout: JSON.stringify({ kind: 'dead-code', total_issues: 1, unexpected: true }),
          stderr: '',
        }),
    },
    {
      title: 'R4: combined empty check with exit 1 cannot pass',
      check: () =>
        checkResultFromFallowHygieneToolRun({
          exitCode: 1,
          stdout: JSON.stringify({ kind: 'combined', check: {} }),
          stderr: '',
        }),
    },
  ]) {
    it(scenario.title, () => {
      const result = scenario.check();
      expect(result.exitCode).not.toBe(0);
      expect(result.failures?.[0]).toBeDefined();
    });
  }
});
