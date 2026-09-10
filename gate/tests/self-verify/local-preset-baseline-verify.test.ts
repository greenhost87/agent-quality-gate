import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

import {
  LOCAL_PRESET_PACKAGE_VERIFY_PRESETS,
  localPresetPackageVerifyRequest,
} from '../../../scripts/self-verify/preset-baseline-verify.js';

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
