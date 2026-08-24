import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { homeInstalledPresetRoot } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { contentHash } from '../../preset-catalog/manifest/content-hash.js';
import { parsePresetManifest } from '../../preset-catalog/manifest/parse-preset-manifest.js';
import { resolvePresetContract } from '../../preset-catalog/catalog/preset-catalog.js';
import { readBytesFileSync, readTextFile, writeTextFile } from '../../process/files/files.js';
import { ensureGateInstallNodeModules } from '../../tests/support/gate-install.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';
import { installPresetFromSource } from '../install-preset/install-preset.js';
import { packagePresetRoot } from '../package-preset-root/package-preset-root.js';

useIsolatedAgentQualityGateHome();

const REPO_ROOT = join(import.meta.dir, '../..');
const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'install-preset');
const EXTERNAL_VALIBOT_IMPORT = /from\s+["']valibot["']|require\(["']valibot["']\)/;
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

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
  await writeTextFile(
    join(root, 'manifest.json'),
    `${JSON.stringify({
      name,
      requires: [],
      files: [],
      dependencies: [],
      oxlint: { nativePlugins: [], plugins: [], rules: {}, overrides: [] },
    })}\n`,
  );
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

  it('inlines npm dependencies into check.js', async () => {
    for (const presetName of ['database', 'playwright'] as const) {
      const destination = await makeTempDirectory(`aqg-packaged-${presetName}-check-`);
      await packagePresetRoot({
        sourceRoot: join(REPO_ROOT, 'presets', presetName),
        destinationRoot: destination,
        bundleCwd: REPO_ROOT,
      });
      const contents = await readTextFile(join(destination, 'check.js'));
      expect(contents).not.toMatch(EXTERNAL_VALIBOT_IMPORT);
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
    const source = await writeOxlintOnlyPreset('packages');
    const destination = await installPresetFromSource(source);
    expect(destination).toBe(homeInstalledPresetRoot('packages'));
    expect(existsSync(join(destination, 'manifest.json'))).toBe(true);
    expect(lstatSync(join(destination, 'node_modules')).isSymbolicLink()).toBe(true);
    expect(realpathSync(join(destination, 'node_modules'))).toBe(realpathSync(installModules));
    const contract = await resolvePresetContract(['packages']);
    expect(contract.names).toEqual(['baseline', 'packages']);
    expect(contract.plugins.some((plugin) => plugin.name === 'packages')).toBe(true);
  });
});
