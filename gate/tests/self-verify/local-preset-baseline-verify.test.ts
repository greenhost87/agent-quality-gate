import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LOCAL_PRESET_PACKAGE_VERIFY_PRESETS,
  localPresetPackageVerifyRequest,
} from '../../../scripts/self-verify/preset-baseline-verify.js';
import { filterOxlintAgentOutput } from '../../execute-verify/filter-oxlint-agent-output.js';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const FIXTURES = join(import.meta.dir, '..', 'execute-verify', 'fixtures');

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

describe('filterOxlintAgentOutput', () => {
  it('drops ignored rule diagnostics and reports when nothing remains', () => {
    const mixed = readFileSync(join(FIXTURES, 'filter-oxlint-agent-mixed.txt'), 'utf8');
    const filtered = filterOxlintAgentOutput(mixed, new Set(['database/dao-boundaries']));
    expect(filtered.text).toContain('aqg(no-class)');
    expect(filtered.text).not.toContain('dao-boundaries');
    expect(filtered.hasRemainingIssues).toBe(true);

    const ownOnly = readFileSync(join(FIXTURES, 'filter-oxlint-agent-own-only.txt'), 'utf8');
    const onlyOwn = filterOxlintAgentOutput(ownOnly, new Set(['database/dao-boundaries']));
    expect(onlyOwn.hasRemainingIssues).toBe(false);
  });
});
