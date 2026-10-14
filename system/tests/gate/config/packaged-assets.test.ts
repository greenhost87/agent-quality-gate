import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { write } from 'bun';

import { afterEach, describe, expect, it } from 'bun:test';

import { resolvePackagedAssetsDirectory } from '#system/config/packaged-assets/packaged-assets.ts';

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function writeMinimalConfigs(configsDir: string): Promise<void> {
  mkdirSync(configsDir, { recursive: true });
  await write(join(configsDir, 'oxlint.config.ts'), 'export default {};\n');
  await write(join(configsDir, '.fallowrc.json'), '{}\n');
}

describe('resolvePackagedAssetsDirectory', () => {
  it('resolves configs beside the consumer', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aqg-configs-adjacent-'));
    tempDirectories.push(root);
    await writeMinimalConfigs(join(root, 'consumer', 'configs'));

    expect(resolvePackagedAssetsDirectory(join(root, 'consumer'))).toBe(
      join(root, 'consumer', 'configs'),
    );
  });

  it('does not search parent or sibling directories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aqg-configs-not-adjacent-'));
    tempDirectories.push(root);
    await writeMinimalConfigs(join(root, 'extensions', 'configs'));
    mkdirSync(join(root, 'cursor'), { recursive: true });

    expect(() => resolvePackagedAssetsDirectory(join(root, 'cursor'))).toThrow(
      /packaged Oxlint\/Fallow assets not found in/,
    );
  });

  it('fails when adjacent assets are missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'aqg-configs-missing-'));
    tempDirectories.push(root);

    expect(() => resolvePackagedAssetsDirectory(root)).toThrow(/verify internal error/);
  });
});
