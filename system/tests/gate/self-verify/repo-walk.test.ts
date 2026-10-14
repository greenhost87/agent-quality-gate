import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { withLocalPresetExecutionRoot } from '#system/scripts/self-verify/local-preset-root.ts';
import { listPresetPackageNames } from '#system/scripts/self-verify/repo-walk.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { tempDirectories } = useTrackedTempDirectories();

describe('listPresetPackageNames', () => {
  it('includes preset directories connected through symbolic links', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aqg-linked-presets-'));
    tempDirectories.push(root);
    const presetsRoot = join(root, 'checkout', 'presets');
    const externalPresetRoot = join(root, 'private', 'external-preset');
    const sourcePackageRoot = join(root, 'agent-quality-gate');
    await mkdir(presetsRoot, { recursive: true });
    await mkdir(externalPresetRoot, { recursive: true });
    await mkdir(sourcePackageRoot);
    await writeFile(join(externalPresetRoot, 'manifest.json'), '{}\n');
    await symlink(externalPresetRoot, join(presetsRoot, 'linked-preset'), 'dir');

    expect(listPresetPackageNames(presetsRoot)).toEqual(['linked-preset']);

    await withLocalPresetExecutionRoot(presetsRoot, 'linked-preset', async (executionRoot) => {
      expect(executionRoot).not.toBe(join(presetsRoot, 'linked-preset'));
      expect(await readFile(join(executionRoot, 'manifest.json'), 'utf8')).toBe('{}\n');
      expect(await realpath(resolve(executionRoot, '../../agent-quality-gate'))).toBe(
        await realpath(sourcePackageRoot),
      );
      expect(listPresetPackageNames(presetsRoot)).toEqual(['linked-preset']);
    });
  });
});
