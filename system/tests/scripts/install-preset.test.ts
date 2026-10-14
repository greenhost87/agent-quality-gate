import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';

import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { homeInstalledPresetRoot } from '#system/config/agent-quality-gate-home.ts';
import { contentHash } from '#system/presets/parse-preset-manifest.ts';
import { parsePresetManifest } from '#system/presets/parse-preset-manifest.ts';
import { resolvePresetContract } from '#system/presets/preset-catalog.ts';
import { readBytesFileSync, readTextFile, writeTextFile } from '#system/process/files/files.ts';
import { ensureGateInstallNodeModules } from '../support/gate-install.ts';
import { useIsolatedAgentQualityGateHome } from '../support/isolated-home.ts';
import { installPresetFromSource } from '#system/scripts/install-preset/install-preset.ts';
import { packagePresetRoot } from '#system/scripts/package-preset-root/package-preset-root.ts';
import { useTrackedTempDirectories } from '../support/tracked-temp-directories.ts';
import { writePresetManifest } from '../support/preset-fixtures.ts';

useIsolatedAgentQualityGateHome();

const REPO_ROOT = join(import.meta.dir, '../../..');
const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'install-preset');
const EXTERNAL_VALIBOT_IMPORT = /from\s+["']valibot["']|require\(["']valibot["']\)/;
const EXTERNAL_AQG_IMPORT = /from\s+["']agent-quality-gate(?:\/[^"']*)?["']/;
const { makeTempDirectory } = useTrackedTempDirectories();

async function writeOxlintOnlyPreset(name: string): Promise<string> {
  const root = await makeTempDirectory(`aqg-preset-${name}-`);
  await mkdir(join(root, 'oxlint'), { recursive: true });
  await writeTextFile(
    join(root, 'manifest.json'),
    `${JSON.stringify({
      name,
      requires: [],
      files: [],
      dependencies: [],
      oxlint: {
        nativePlugins: [],
        plugins: [{ name, specifier: `oxlint/${name}.ts` }],
        rules: { [`${name}/example`]: 'error' },
        overrides: [],
      },
    })}\n`,
  );
  await cp(join(FIXTURES_ROOT, 'plugin.ts'), join(root, 'oxlint', `${name}.ts`));
  return root;
}

async function writeCheckModulePreset(name: string): Promise<string> {
  const root = await makeTempDirectory(`aqg-preset-check-${name}-`);
  await writePresetManifest(root, name);
  await cp(join(FIXTURES_ROOT, 'helper.ts'), join(root, 'helper.ts'));
  await cp(join(FIXTURES_ROOT, 'check.ts'), join(root, 'check.ts'));
  return root;
}

describe('packagePresetRoot', () => {
  it('bundles oxlint TypeScript plugins to JavaScript', async () => {
    const source = await writeOxlintOnlyPreset('demo-oxlint');
    const destination = await makeTempDirectory('aqg-packaged-');
    const packaged = await packagePresetRoot({
      sourceRoot: source,
      destinationRoot: destination,
    });
    expect(packaged.name).toBe('demo-oxlint');
    expect(existsSync(join(destination, 'manifest.json'))).toBe(true);
    expect(existsSync(join(destination, 'oxlint', 'demo-oxlint.js'))).toBe(true);
    expect(existsSync(join(destination, 'oxlint', 'demo-oxlint.ts'))).toBe(false);
    const manifest: unknown = JSON.parse(await readTextFile(join(destination, 'manifest.json')));
    expect(manifest).toMatchObject({
      oxlint: {
        plugins: [{ name: 'demo-oxlint', specifier: 'oxlint/demo-oxlint.js' }],
      },
    });
  });

  it('bundles check.ts into check.js', async () => {
    const source = await writeCheckModulePreset('demo-check');
    const destination = await makeTempDirectory('aqg-packaged-check-');
    await packagePresetRoot({
      sourceRoot: source,
      destinationRoot: destination,
      bundleCwd: source,
    });
    const checkJs = join(destination, 'check.js');
    expect(existsSync(checkJs)).toBe(true);
    expect(existsSync(join(destination, 'check.ts'))).toBe(false);
    const contents = await readTextFile(checkJs);
    expect(contents).toContain('from-helper');
  });

  it('bundles AQG modules and inlines npm dependencies into check.js', async () => {
    for (const presetName of ['database', 'database-sqlite', 'playwright'] as const) {
      const destination = await makeTempDirectory(`aqg-packaged-${presetName}-check-`);
      await packagePresetRoot({
        sourceRoot: join(REPO_ROOT, 'presets', presetName),
        destinationRoot: destination,
        bundleCwd: REPO_ROOT,
      });
      const contents = await readTextFile(join(destination, 'check.js'));
      expect(contents).not.toMatch(EXTERNAL_VALIBOT_IMPORT);
      expect(contents).not.toMatch(EXTERNAL_AQG_IMPORT);
    }
  });

  it('embeds sha256 contentHash for managed files', async () => {
    const destination = await makeTempDirectory('aqg-packaged-hashes-');
    await packagePresetRoot({
      sourceRoot: join(REPO_ROOT, 'presets', 'config'),
      destinationRoot: destination,
      bundleCwd: REPO_ROOT,
    });
    const manifest = await parsePresetManifest(join(destination, 'manifest.json'));
    expect(manifest.files.length).toBeGreaterThan(0);
    for (const file of manifest.files) {
      expect(file.contentHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(file.contentHash).toBe(contentHash(readBytesFileSync(join(destination, file.source))));
    }
  });
});

describe('installPresetFromSource', () => {
  it('installs under AGENT_QUALITY_GATE_HOME/presets/<name>', async () => {
    const installModules = await ensureGateInstallNodeModules();
    const source = await writeOxlintOnlyPreset('demo-oxlint');
    const destination = await installPresetFromSource(source);
    expect(destination).toBe(homeInstalledPresetRoot('demo-oxlint'));
    expect(existsSync(join(destination, 'manifest.json'))).toBe(true);
    expect(lstatSync(join(destination, 'node_modules')).isSymbolicLink()).toBe(true);
    expect(realpathSync(join(destination, 'node_modules'))).toBe(realpathSync(installModules));
    const contract = await resolvePresetContract(['demo-oxlint']);
    expect(contract.names).toEqual(['baseline', 'demo-oxlint']);
    expect(contract.plugins.some((plugin) => plugin.name === 'demo-oxlint')).toBe(true);
  });

  it('rejects packages as a preset name', async () => {
    await expect(resolvePresetContract(['packages'])).rejects.toThrow('unknown preset "packages"');
  });
});
