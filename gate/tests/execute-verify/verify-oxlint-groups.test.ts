import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { selectFirstNonEmptyOxlintGroup } from '../../execute-verify/filter-oxlint-agent-output.js';
import { oxlintVirtualGroupsFromRules } from '../../execute-verify/oxlint-virtual-groups.js';
import { parsePresetManifest } from '../../../preset-catalog/manifest/parse-preset-manifest.js';
import { oxlintRulePhaseOf } from '../../../preset-catalog/oxlint-config/oxlint-rule-phase.js';
import { SHIPPED_PRESET_NAMES } from '../../../preset-catalog/catalog/preset-catalog.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  EXECUTE_VERIFY_REPO_ROOT,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

const FIXTURES = join(import.meta.dir, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('oxlint output grouping', () => {
  const groups = [
    { id: 'boundaries:database', ruleIds: new Set(['database/dao-boundaries']) },
    { id: 'lint', ruleIds: new Set(['aqg/no-class']) },
  ];

  it('shows only the first non-empty group and counts deferred findings', () => {
    const output = fixture('select-first-group-boundaries.txt');
    const selection = selectFirstNonEmptyOxlintGroup(output, groups);
    expect(selection.hasIssues).toBe(true);
    expect(selection.deferredCount).toBe(2);
    expect(selection.text).toContain('dao-boundaries');
    expect(selection.text).not.toContain('no-class');
  });

  it('falls through to the catch-all group for unknown rule ids', () => {
    const output = 'src/x.ts:1:1: error eslint(no-debugger): debugger\n';
    const selection = selectFirstNonEmptyOxlintGroup(output, groups);
    expect(selection.hasIssues).toBe(true);
    expect(selection.deferredCount).toBe(0);
    expect(selection.text).toContain('no-debugger');
  });

  it('passes through output without issue lines untouched', () => {
    const output = fixture('select-first-group-crash.txt');
    const selection = selectFirstNonEmptyOxlintGroup(output, groups);
    expect(selection).toEqual({ text: output, deferredCount: 0, hasIssues: false });
  });
});

describe('oxlint output grouping across tool streams', () => {
  it('selects one group globally across stdout and stderr', async () => {
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
            stdout: 'src/index.ts:1:1: error aqg(no-class): class found\n',
            stderr: 'src/dao.ts:1:1: error database(dao-boundaries): bad DAO usage\n',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.stdout).not.toContain('no-class');
    expect(result.stderr).toContain('dao-boundaries');
    expect(result.stderr).toContain('verify: deferred: 1');
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
            stdout: fixture('semantic-lint-same-group.txt'),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.stdout).toContain('no-class');
    expect(result.stdout).toContain('no-debugger');
    expect(result.stderr).not.toContain('deferred');
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
    ]);
    expect(groups[4]?.ruleIds.has('aqg/no-class')).toBe(true);
  });

  it('splits contracts, ui, and lint groups after boundaries by default', () => {
    const groups = oxlintVirtualGroupsFromRules({
      'database/dao-boundaries': { severity: 'error', phase: 'boundaries' },
      'bun-parse/no-handmade-json-types': { severity: 'error', phase: 'contracts' },
      'react-presentation/render-only-components': { severity: 'error', phase: 'ui' },
      'aqg/no-class': 'error',
    });
    expect(groups.map((group) => group.id)).toEqual([
      'boundaries:database',
      'contracts',
      'ui',
      'lint',
    ]);
    expect(groups[3]?.ruleIds.has('aqg/no-class')).toBe(true);
  });

  it('honors config-driven group order and boundary plugin priority', () => {
    const groups = oxlintVirtualGroupsFromRules(
      {
        'packages/package-boundaries': { severity: 'error', phase: 'boundaries' },
        'config/no-valibot-custom': { severity: 'error', phase: 'contracts' },
        'react-presentation/ui-boundary': { severity: 'error', phase: 'boundaries' },
        'aqg/no-class': 'error',
      },
      [],
      [],
      {
        groupOrder: ['contracts', 'boundaries'],
        boundaryPluginPriority: ['packages'],
      },
    );
    expect(groups.map((group) => group.id)).toEqual([
      'contracts',
      'boundaries:packages',
      'boundaries:react-presentation',
      'lint',
    ]);
  });
});

describe('manifest rule phase compatibility', () => {
  function expectedPhase(presetName: string, ruleId: string): 'boundaries' | 'contracts' | 'lint' {
    if (presetName === 'config') {
      return ruleId === 'config/environment-boundaries'
        ? 'boundaries'
        : ruleId === 'config/no-valibot-custom' ||
            ruleId === 'config/no-trivial-valibot-schema-alias'
          ? 'contracts'
          : 'lint';
    }
    if (presetName === 'bun-parse') {
      if (ruleId === 'bun-parse/scripts-boundaries') {
        return 'boundaries';
      }
      return ruleId === 'bun-parse/no-handmade-json-types' ||
        ruleId === 'bun-parse/no-raw-json-parse' ||
        ruleId === 'bun-parse/no-typeof-object'
        ? 'contracts'
        : 'lint';
    }
    return ['module-placement', 'database', 'database-sqlite', 'playwright'].includes(presetName)
      ? 'boundaries'
      : 'lint';
  }

  it('keeps string rule settings compatible and tags boundary presets', async () => {
    for (const presetName of SHIPPED_PRESET_NAMES) {
      const manifest = await parsePresetManifest(
        join(EXECUTE_VERIFY_REPO_ROOT, 'presets', presetName, 'manifest.json'),
      );
      for (const [ruleId, setting] of Object.entries(manifest.oxlint.rules)) {
        expect(oxlintRulePhaseOf(setting)).toBe(expectedPhase(presetName, ruleId));
      }
      for (const override of manifest.oxlint.overrides) {
        for (const [ruleId, setting] of Object.entries(override.rules)) {
          expect(oxlintRulePhaseOf(setting)).toBe(expectedPhase(presetName, ruleId));
        }
      }
    }
  });
});
