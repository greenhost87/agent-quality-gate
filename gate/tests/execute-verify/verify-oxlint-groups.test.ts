import { describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { selectFirstNonEmptyOxlintDiagnosticGroup } from '../../execute-verify/oxlint-diagnostics.js';
import { filterIgnoredOxlintDiagnostics } from '../../execute-verify/oxlint-diagnostics.js';
import { oxlintVirtualGroupsFromRules } from '../../execute-verify/oxlint-virtual-groups.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import { formatVerifyResultDiagnostics } from '../../quality-gate-run/format-diagnostics.js';
import type {
  Diagnostic,
  DiagnosticLocation,
  DiagnosticSeverity,
} from '../../execute-verify/check-result.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

function emptyFallow(args: readonly string[]): string {
  if (args.includes('--complexity')) {
    return '{"kind":"health","findings":[]}';
  }
  if (args.includes('--skip')) {
    return '{"kind":"combined","check":{"total_issues":0},"dupes":{"clone_groups":[]}}';
  }
  return '{"kind":"dead-code","total_issues":0}';
}

type DiagnosticFields = {
  message: string;
  ruleId: string;
  source?: string;
  severity?: DiagnosticSeverity;
  location?: DiagnosticLocation;
  related?: readonly DiagnosticLocation[];
  help?: string;
  url?: string;
  groupHeader?: string;
};

function diagnostic(partial: DiagnosticFields): Diagnostic {
  return {
    source: partial.source ?? 'oxlint',
    severity: partial.severity ?? 'error',
    message: partial.message,
    ruleId: partial.ruleId,
    ...(partial.location === undefined ? {} : { location: partial.location }),
    ...(partial.related === undefined ? {} : { related: partial.related }),
    ...(partial.help === undefined ? {} : { help: partial.help }),
    ...(partial.url === undefined ? {} : { url: partial.url }),
    ...(partial.groupHeader === undefined ? {} : { groupHeader: partial.groupHeader }),
  };
}

describe('oxlint diagnostic grouping', () => {
  const groups = [
    { id: 'boundaries:database', ruleIds: new Set(['database/dao-boundaries']) },
    { id: 'lint', ruleIds: new Set(['aqg/no-class']) },
  ];

  it('shows only the first non-empty group and counts deferred findings', () => {
    const selection = selectFirstNonEmptyOxlintDiagnosticGroup(
      [
        diagnostic({
          ruleId: 'database/dao-boundaries',
          message: 'bad dao',
          location: { path: 'src/dao.ts', line: 1, column: 1 },
        }),
        diagnostic({
          ruleId: 'aqg/no-class',
          message: 'class found',
          location: { path: 'src/index.ts', line: 1, column: 1 },
        }),
        diagnostic({
          ruleId: 'aqg/no-class',
          message: 'another class',
          location: { path: 'src/other.ts', line: 1, column: 1 },
        }),
      ],
      groups,
    );
    expect(selection.hasIssues).toBe(true);
    expect(selection.deferredCount).toBe(2);
    expect(selection.diagnostics.every((entry) => entry.ruleId === 'database/dao-boundaries')).toBe(
      true,
    );
  });

  it('falls through to the catch-all group for unknown rule ids', () => {
    const selection = selectFirstNonEmptyOxlintDiagnosticGroup(
      [
        diagnostic({
          ruleId: 'no-debugger',
          message: 'debugger',
          location: { path: 'src/x.ts', line: 1, column: 1 },
        }),
      ],
      groups,
    );
    expect(selection.hasIssues).toBe(true);
    expect(selection.deferredCount).toBe(0);
    expect(selection.diagnostics[0]?.ruleId).toBe('no-debugger');
  });

  it('returns empty selection when there are no diagnostics', () => {
    const selection = selectFirstNonEmptyOxlintDiagnosticGroup([], groups);
    expect(selection).toEqual({ diagnostics: [], deferredCount: 0, hasIssues: false });
  });

  it('does not treat rule ids mentioned only in message or filename as matches', () => {
    const ignored = filterIgnoredOxlintDiagnostics(
      [
        diagnostic({
          ruleId: 'aqg/no-class',
          message: 'mentions database/dao-boundaries in text',
          location: { path: 'src/database/dao-boundaries.ts', line: 1, column: 1 },
        }),
      ],
      new Set(['database/dao-boundaries']),
    );
    expect(ignored.hasRemainingIssues).toBe(true);
    expect(ignored.diagnostics).toHaveLength(1);

    const selection = selectFirstNonEmptyOxlintDiagnosticGroup(
      [
        diagnostic({
          ruleId: 'aqg/no-class',
          message: 'see database/dao-boundaries',
          location: { path: 'src/database/dao-boundaries.ts', line: 1, column: 1 },
        }),
      ],
      groups,
    );
    expect(selection.groupIndex).toBe(1);
    expect(selection.diagnostics[0]?.ruleId).toBe('aqg/no-class');
  });
});

describe('oxlint output grouping across tool streams', () => {
  it('selects one group globally across diagnostics (not separate stdout/stderr text passes)', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        presets: ['database'],
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: JSON.stringify({
              diagnostics: [
                {
                  message: 'class found',
                  code: 'aqg(no-class)',
                  severity: 'error',
                  filename: 'src/index.ts',
                  labels: [{ span: { line: 1, column: 1 } }],
                },
                {
                  message: 'bad DAO usage',
                  code: 'database(dao-boundaries)',
                  severity: 'error',
                  filename: 'src/dao.ts',
                  labels: [{ span: { line: 1, column: 1 } }],
                },
              ],
            }),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: emptyFallow(options.args), stderr: '' };
      },
    );
    const text = formatVerifyResultDiagnostics(result);
    expect(text).not.toContain('no-class');
    expect(text).toContain('dao-boundaries');
    expect(result.deferredCount).toBe(1);
    expect(text).toContain('verify: deferred: 1');
  });

  it('keeps packaged and preset semantic-lint rules in one group', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: JSON.stringify({
              diagnostics: [
                {
                  message: 'class found',
                  code: 'aqg(no-class)',
                  severity: 'error',
                  filename: 'src/index.ts',
                  labels: [{ span: { line: 1, column: 1 } }],
                },
                {
                  message: 'debugger',
                  code: 'eslint(no-debugger)',
                  severity: 'error',
                  filename: 'src/index.ts',
                  labels: [{ span: { line: 2, column: 1 } }],
                },
              ],
            }),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: emptyFallow(options.args), stderr: '' };
      },
    );
    const text = formatVerifyResultDiagnostics(result);
    expect(text).toContain('no-class');
    expect(text).toContain('no-debugger');
    expect(result.deferredCount ?? 0).toBe(0);
  });
});

describe('oxlint virtual groups', () => {
  it('orders boundaries plugins by priority and keeps other rules in lint', () => {
    const groups = oxlintVirtualGroupsFromRules({
      'playwright/config': { severity: 'error', phase: 'boundaries' },
      'database/dao-boundaries': { severity: 'error', phase: 'boundaries' },
      'config/environment-boundaries': { severity: 'error', phase: 'boundaries' },
      'module-placement/module-placement': { severity: 'error', phase: 'boundaries' },
      'aqg/no-class': 'error',
    });
    expect(groups.map((group) => group.id)).toEqual([
      'boundaries:module-placement',
      'boundaries:config',
      'boundaries:database',
      'boundaries:playwright',
      'lint',
      'ui',
    ]);
    expect(groups.find((group) => group.id === 'lint')?.ruleIds.has('aqg/no-class')).toBe(true);
  });

  it('splits contracts, lint, and ui groups after boundaries by default', () => {
    const groups = oxlintVirtualGroupsFromRules({
      'database/dao-boundaries': { severity: 'error', phase: 'boundaries' },
      'bun-parse/no-handmade-json-types': { severity: 'error', phase: 'contracts' },
      'sample-ui/render-only-components': { severity: 'error', phase: 'ui' },
      'aqg/no-class': 'error',
    });
    expect(groups.map((group) => group.id)).toEqual([
      'boundaries:database',
      'contracts',
      'lint',
      'ui',
    ]);
  });

  it('honors configured groupOrder and boundaryPluginPriority', () => {
    const groups = oxlintVirtualGroupsFromRules(
      {
        'playwright/config': { severity: 'error', phase: 'boundaries' },
        'database/dao-boundaries': { severity: 'error', phase: 'boundaries' },
        'config/environment-boundaries': { severity: 'error', phase: 'boundaries' },
        'bun-parse/no-handmade-json-types': { severity: 'error', phase: 'contracts' },
        'sample-ui/render-only-components': { severity: 'error', phase: 'ui' },
        'aqg/no-class': 'error',
      },
      [],
      [],
      {
        groupOrder: ['ui', 'contracts', 'boundaries'],
        boundaryPluginPriority: ['playwright', 'database', 'config'],
      },
    );
    expect(groups.map((group) => group.id)).toEqual([
      'ui',
      'contracts',
      'boundaries:playwright',
      'boundaries:database',
      'boundaries:config',
      'lint',
      'ui',
    ]);
  });
});
