import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

import {
  LOCAL_PRESET_PACKAGE_VERIFY_PRESETS,
  localPresetPackageVerifyRequest,
} from '../../../scripts/self-verify/preset-baseline-verify.js';
import type { Diagnostic } from '../../execute-verify/check-result.js';
import { filterIgnoredOxlintDiagnostics } from '../../execute-verify/oxlint-diagnostics.js';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

describe('local preset package verify', () => {
  it('builds a full-preset verify request that ignores that package own oxlint rules', async () => {
    const request = await localPresetPackageVerifyRequest(REPO_ROOT, 'database');
    expect(request.projectRoot).toBe(join(REPO_ROOT, 'presets', 'database'));
    expect(request.presets).toEqual([...LOCAL_PRESET_PACKAGE_VERIFY_PRESETS]);
    expect(request.skipPresetProjectChecks).toBe(true);
    expect(request.ignoreOxlintRuleIds).toEqual([
      'database/dao-boundaries',
      'database/test-database-boundaries',
    ]);
    expect(request.okLabel).toBe('preset package database');
    expect(request.entries).toContain('payload/**/*.ts');
    expect(request.ignorePatterns).toContain('.quality-fixtures/**');
  });

  it('does not apply the incompatible PostgreSQL preset to the SQLite package', async () => {
    const request = await localPresetPackageVerifyRequest(REPO_ROOT, 'database-sqlite');
    expect(request.presets).not.toContain('database');
    expect(request.presets).toContain('database-sqlite');
    expect(request.presets).toContain('config');
    expect(request.ignoreOxlintRuleIds).toEqual([
      'database-sqlite/boundaries',
      'database-sqlite/test-boundaries',
    ]);
  });
});

describe('filterIgnoredOxlintDiagnostics', () => {
  it('drops ignored rule diagnostics and reports when nothing remains', () => {
    const mixed: Diagnostic[] = [
      {
        source: 'oxlint',
        ruleId: 'database/dao-boundaries',
        severity: 'error',
        message: 'dao boundary',
        location: { path: 'src/a.ts', line: 1, column: 1 },
      },
      {
        source: 'oxlint',
        ruleId: 'aqg/no-class',
        severity: 'error',
        message: 'class found',
        location: { path: 'src/b.ts', line: 1, column: 1 },
      },
    ];
    const filtered = filterIgnoredOxlintDiagnostics(mixed, new Set(['database/dao-boundaries']));
    expect(filtered.diagnostics).toHaveLength(1);
    expect(filtered.diagnostics[0]?.ruleId).toBe('aqg/no-class');
    expect(filtered.hasRemainingIssues).toBe(true);

    const onlyOwn = filterIgnoredOxlintDiagnostics(
      [
        {
          source: 'oxlint',
          ruleId: 'database/dao-boundaries',
          severity: 'error',
          message: 'dao boundary',
          location: { path: 'src/a.ts', line: 1, column: 1 },
        },
      ],
      new Set(['database/dao-boundaries']),
    );
    expect(onlyOwn.hasRemainingIssues).toBe(false);
  });
});
