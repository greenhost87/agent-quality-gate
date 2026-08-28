import { write } from 'bun';
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { optionalPresetSourceRoots } from '../install-optional-presets.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

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
      'react-duplication',
      'oxlint-ui-surface',
    ]);
    expect(optionalPresetSourceRoots(presetsDirectory)).toEqual([
      join(presetsDirectory, 'oxlint-ui-surface'),
      join(presetsDirectory, 'react-duplication'),
    ]);
  });

  it('returns empty when presets directory is missing', () => {
    expect(optionalPresetSourceRoots(join(tmpdir(), 'missing-optional-presets-directory'))).toEqual(
      [],
    );
  });
});
