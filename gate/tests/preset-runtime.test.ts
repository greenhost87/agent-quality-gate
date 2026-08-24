import { existsSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { FALLOW_CONFIG_NAME, packagedFallowConfigPath } from 'agent-quality-gate/preset-runtime';
import {
  baselinePresetRepositoryVerifyRequest,
  packagedAssetsDirectory,
  resolvePresetContract,
} from 'agent-quality-gate/verify';
import { walkAst } from 'agent-quality-gate/oxlint-walk';

describe('package exports', () => {
  it('resolves packaged Fallow assets through agent-quality-gate/preset-runtime', () => {
    const path = packagedFallowConfigPath();
    expect(path.endsWith(FALLOW_CONFIG_NAME)).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it('exports walkAst through agent-quality-gate/oxlint-walk', () => {
    expect(typeof walkAst).toBe('function');
  });

  it('resolves shipped presets through agent-quality-gate/verify', async () => {
    const assets = packagedAssetsDirectory();
    expect(existsSync(assets)).toBe(true);
    expect((await resolvePresetContract([])).names).toEqual(['baseline']);
  });

  it('builds a baseline verify request for optional preset repositories', () => {
    const request = baselinePresetRepositoryVerifyRequest('/tmp/aqg-presets');
    expect(request.projectRoot).toBe('/tmp/aqg-presets');
    expect(request.entries).toContain('live-ui-surface/check.ts');
    expect(request.entries).toContain('react-duplication/check.ts');
    expect(request.ignorePatterns).toContain('**/tests/**');
    expect(request.fallowIgnoreDependencies).toContain('oxlint-plugin-eslint');
    expect(request.presets).toEqual(['bun-parse']);
  });
});
