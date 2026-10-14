import { write } from 'bun';
import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { optionalPresetSourceRoots } from '#system/scripts/install-local/install-optional-presets.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { tempDirectories: tempRoots } = useTrackedTempDirectories();

async function createPresetsDirectory(names: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'optional-presets-'));
  tempRoots.push(root);
  for (const name of names) {
    const presetRoot = join(root, name);
    await mkdir(presetRoot);
    await write(join(presetRoot, 'manifest.json'), `${JSON.stringify({ name })}\n`);
  }
  return root;
}

describe('optionalPresetSourceRoots', () => {
  it('lists optional preset directories and excludes shipped presets', async () => {
    const presetsDirectory = await createPresetsDirectory([
      'baseline',
      'optional-alpha',
      'optional-beta',
    ]);
    expect(optionalPresetSourceRoots(presetsDirectory)).toEqual([
      join(presetsDirectory, 'optional-alpha'),
      join(presetsDirectory, 'optional-beta'),
    ]);
  });

  it('lists optional preset directories reached through checkout symlinks', async () => {
    const presetsDirectory = await createPresetsDirectory([]);
    const sourceRoot = await createPresetsDirectory(['linked-preset']);
    await symlink(join(sourceRoot, 'linked-preset'), join(presetsDirectory, 'linked-preset'));

    expect(optionalPresetSourceRoots(presetsDirectory)).toEqual([
      join(presetsDirectory, 'linked-preset'),
    ]);
  });

  it('returns empty when presets directory is missing', () => {
    expect(optionalPresetSourceRoots(join(tmpdir(), 'missing-optional-presets-directory'))).toEqual(
      [],
    );
  });
});
