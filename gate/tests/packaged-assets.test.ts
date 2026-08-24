import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { write } from 'bun';

import { afterEach, describe, expect, it } from 'bun:test';

import { resolvePackagedAssetsDirectory } from '../../config/packaged-assets/packaged-assets.js';

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function writeMinimalAssets(assetsDir: string): Promise<void> {
  mkdirSync(assetsDir, { recursive: true });
  await write(join(assetsDir, 'oxlint.config.ts'), 'export default {};\n');
  await write(join(assetsDir, '.fallowrc.json'), '{}\n');
}

describe('resolvePackagedAssetsDirectory', () => {
  it('resolves sibling assets/ (extensions or source layout)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aqg-assets-ext-'));
    tempDirectories.push(root);
    const assets = join(root, 'assets');
    await writeMinimalAssets(assets);
    expect(resolvePackagedAssetsDirectory(root)).toBe(assets);
  });

  it('resolves ../assets from a nested source directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aqg-assets-parent-'));
    tempDirectories.push(root);
    const assets = join(root, 'assets');
    const nested = join(root, 'config');
    await writeMinimalAssets(assets);
    mkdirSync(nested);
    expect(resolvePackagedAssetsDirectory(nested)).toBe(assets);
  });

  it('resolves ../extensions/assets from a cursor/ bundle directory', async () => {
    const install = mkdtempSync(join(tmpdir(), 'aqg-assets-cursor-'));
    tempDirectories.push(install);
    const extensionsAssets = join(install, 'dist', 'extensions', 'assets');
    const cursorDir = join(install, 'dist', 'cursor');
    await writeMinimalAssets(extensionsAssets);
    mkdirSync(cursorDir, { recursive: true });
    expect(resolvePackagedAssetsDirectory(cursorDir)).toBe(extensionsAssets);
  });

  it('resolves ../../extensions/assets from a preset check.js directory', async () => {
    const install = mkdtempSync(join(tmpdir(), 'aqg-assets-preset-'));
    tempDirectories.push(install);
    const extensionsAssets = join(install, 'dist', 'extensions', 'assets');
    const presetDir = join(install, 'dist', 'presets', 'database');
    await writeMinimalAssets(extensionsAssets);
    mkdirSync(presetDir, { recursive: true });
    expect(resolvePackagedAssetsDirectory(presetDir)).toBe(extensionsAssets);
  });

  it('resolves install/dist/extensions/assets from a home-installed preset check.js directory', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aqg-assets-home-preset-'));
    tempDirectories.push(home);
    const extensionsAssets = join(home, 'install', 'dist', 'extensions', 'assets');
    const presetDir = join(home, 'presets', 'react-duplication');
    await writeMinimalAssets(extensionsAssets);
    mkdirSync(presetDir, { recursive: true });
    expect(resolvePackagedAssetsDirectory(presetDir)).toBe(extensionsAssets);
  });

  it('fails with an internal error when assets are missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'aqg-assets-missing-'));
    tempDirectories.push(root);
    expect(() => resolvePackagedAssetsDirectory(root)).toThrow(/verify internal error/);
  });
});
