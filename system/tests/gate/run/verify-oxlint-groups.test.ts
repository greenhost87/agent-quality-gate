import { describe, expect, it } from 'bun:test';

import { selectFirstNonEmptyOxlintDiagnosticGroup } from '#system/gate/run/oxlint/diagnostics.ts';
import { filterIgnoredOxlintDiagnostics } from '#system/gate/run/oxlint/diagnostics.ts';
import {
  lintGroupOrder,
  oxlintVirtualGroupsFromRules,
} from '#system/gate/run/oxlint/virtual-groups.ts';
import {
  executeVerifyDatabasePreset,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import { formatVerifyResultDiagnostics } from '#system/gate/quality-gate-run/format-diagnostics.ts';
import {
  debuggerDiagnostic,
  oxlintClassFoundDiagnostic,
  oxlintFailureResult,
  oxlintJsonDiagnostic,
  stubVerifyTools,
} from './verify-phases-helpers.js';
import type {
  Diagnostic,
  DiagnosticLocation,
  DiagnosticSeverity,
} from '#system/gate/run/check-result.ts';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject, runVerifyWithLauncher } = useExecuteVerifyProjects();

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

const groups = [
  { id: 'boundaries:database', ruleIds: new Set(['database/dao-boundaries']) },
  { id: 'lint', ruleIds: new Set(['aqg/no-class']) },
];

function selectGroup(diagnostics: Diagnostic[]) {
  return selectFirstNonEmptyOxlintDiagnosticGroup(diagnostics, groups);
}

describe('oxlint diagnostic grouping', () => {
  it('shows only the first non-empty group and counts deferred findings', () => {
    const selection = selectGroup([
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
    ]);
    expect(selection.hasIssues).toBe(true);
    expect(selection.deferredCount).toBe(2);
    expect(selection.diagnostics.every((entry) => entry.ruleId === 'database/dao-boundaries')).toBe(
      true,
    );
  });

  it('falls through to the catch-all group for unknown rule ids', () => {
    const selection = selectGroup([
      diagnostic({
        ruleId: 'no-debugger',
        message: 'debugger',
        location: { path: 'src/x.ts', line: 1, column: 1 },
      }),
    ]);
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
    const result = await executeVerifyDatabasePreset(
      cwd,
      stubVerifyTools({
        oxlint: () =>
          oxlintFailureResult(
            oxlintClassFoundDiagnostic(),
            oxlintJsonDiagnostic({
              message: 'bad DAO usage',
              code: 'database(dao-boundaries)',
              filename: 'src/dao.ts',
            }),
          ),
      }),
    );
    const text = formatVerifyResultDiagnostics(result);
    expect(text).not.toContain('no-class');
    expect(text).toContain('dao-boundaries');
    expect(result.deferredCount).toBe(1);
    expect(text).toContain('verify: deferred: 1');
  });

  it('keeps packaged and preset semantic-lint rules in one group', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const result = await runVerifyWithLauncher(
      cwd,
      stubVerifyTools({
        oxlint: () => oxlintFailureResult(oxlintClassFoundDiagnostic(), debuggerDiagnostic(2)),
      }),
    );
    const text = formatVerifyResultDiagnostics(result);
    expect(text).toContain('no-class');
    expect(text).toContain('no-debugger');
    expect(result.deferredCount ?? 0).toBe(0);
  });
});

const boundaryPluginRules = {
  'playwright/config': { severity: 'error', phase: 'boundaries' },
  'database/dao-boundaries': { severity: 'error', phase: 'boundaries' },
  'config/environment-boundaries': { severity: 'error', phase: 'boundaries' },
} as const;
const commonDefaultGroups = ['lint', 'ui'];

function expectGroupIds(
  groups: ReturnType<typeof oxlintVirtualGroupsFromRules>,
  expected: string[],
) {
  expect(groups.map((group) => group.id)).toEqual(expected);
}

describe('oxlint virtual groups', () => {
  it('uses configured e2e ordering instead of the default', () => {
    expect(lintGroupOrder(['e2e', 'ui', 'contracts'])).toEqual(['e2e', 'ui', 'contracts', 'lint']);
  });

  it('orders boundaries plugins by priority and keeps other rules in lint', () => {
    const groups = oxlintVirtualGroupsFromRules({
      ...boundaryPluginRules,
      'module-placement/module-placement': { severity: 'error', phase: 'boundaries' },
      'aqg/no-class': 'error',
    });
    expectGroupIds(groups, [
      'boundaries:module-placement',
      'boundaries:config',
      'boundaries:database',
      'boundaries:playwright',
      ...commonDefaultGroups,
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
    expectGroupIds(groups, ['boundaries:database', 'contracts', ...commonDefaultGroups]);
  });

  it('honors configured groupOrder and boundaryPluginPriority', () => {
    const groups = oxlintVirtualGroupsFromRules(
      {
        ...boundaryPluginRules,
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
    ]);
  });
});
