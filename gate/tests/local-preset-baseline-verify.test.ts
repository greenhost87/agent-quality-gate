import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  listLocalPresetPackageNames,
  LOCAL_PRESET_PACKAGE_VERIFY_PRESETS,
  localPresetPackageVerifyRequest,
} from '../../scripts/self-verify/preset-baseline-verify.js';
import { oxlintRuleIdsFromManifest } from '../../preset-catalog/oxlint-config/oxlint-rule-ids-from-manifest.js';
import { parsePresetManifest } from '../../preset-catalog/manifest/parse-preset-manifest.js';
import { filterOxlintAgentOutput } from '../execute-verify/filter-oxlint-agent-output.js';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const FIXTURES = join(import.meta.dir, 'fixtures');

describe('local preset package verify', () => {
  it('lists every in-repo preset package with a manifest', () => {
    expect(listLocalPresetPackageNames(REPO_ROOT)).toEqual([
      'baseline',
      'bun-parse',
      'config',
      'database',
      'module-placement',
      'playwright',
    ]);
  });

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

  it('collects override rule ids from the baseline manifest', async () => {
    const manifest = await parsePresetManifest(
      join(REPO_ROOT, 'presets', 'baseline', 'manifest.json'),
    );
    const ids = oxlintRuleIdsFromManifest(manifest);
    expect(ids).toContain('aqg/no-types-in-runtime-files');
    expect(ids).toContain('aqg/console-format-placeholders');
  });
});

describe('filterOxlintAgentOutput', () => {
  it('drops ignored rule diagnostics and reports when nothing remains', () => {
    const mixed = readFileSync(join(FIXTURES, 'filter-oxlint-agent-mixed.txt'), 'utf8');
    const filtered = filterOxlintAgentOutput(mixed, new Set(['database/dao-boundaries']));
    expect(filtered.text).toContain('aqg(no-types-in-runtime-files)');
    expect(filtered.text).not.toContain('dao-boundaries');
    expect(filtered.hasRemainingIssues).toBe(true);

    const ownOnly = readFileSync(join(FIXTURES, 'filter-oxlint-agent-own-only.txt'), 'utf8');
    const onlyOwn = filterOxlintAgentOutput(ownOnly, new Set(['database/dao-boundaries']));
    expect(onlyOwn.hasRemainingIssues).toBe(false);
  });
});
