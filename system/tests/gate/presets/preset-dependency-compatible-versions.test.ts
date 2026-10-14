import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { PresetProjectDependency } from '#system/presets/preset-contract.types.ts';
import {
  formatDependencyViolations,
  verifyPresetDependencies,
} from '#system/presets/verify-preset-dependencies.ts';
import { parsePresetManifest } from '#system/presets/parse-preset-manifest.ts';
import { writeTextFile } from '#system/process/files/files.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { tempDirectories: temporaryDirectories } = useTrackedTempDirectories();
const dependency: PresetProjectDependency = {
  name: 'valibot',
  version: '1.4.2',
  compatibleVersions: ['1.5.0'],
  section: 'dependencies',
};

async function createProject(version: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'preset-compatible-version-'));
  temporaryDirectories.push(root);
  await writeTextFile(
    join(root, 'package.json'),
    `${JSON.stringify({ dependencies: { valibot: version } }, null, 2)}\n`,
  );
  return root;
}

describe('preset dependency compatible versions', () => {
  it('accepts the minimum, compatible, and newer exact versions', async () => {
    for (const version of ['1.4.2', '1.5.0', '1.6.0', '2.0.0']) {
      const root = await createProject(version);
      const result = await verifyPresetDependencies(root, [dependency]);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects exact versions below the minimum', async () => {
    const root = await createProject('1.4.1');
    const result = await verifyPresetDependencies(root, [dependency]);

    expect(result.ok).toBe(false);
    expect(formatDependencyViolations(result.violations)).toContain(
      'preset dependency valibot@1.4.2 or 1.5.0 is incompatible',
    );
  });

  it('parses optional Fallow rule and finding-key contributions from a preset manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'preset-fallow-manifest-'));
    temporaryDirectories.push(root);
    const manifestPath = join(root, 'manifest.json');
    await writeTextFile(
      manifestPath,
      `${JSON.stringify(
        {
          name: 'fallow-fixture',
          requires: [],
          files: [],
          dependencies: [],
          fallow: { rules: { 'custom-rule': 'error' }, checkKeys: ['custom_findings'] },
        },
        null,
        2,
      )}\n`,
    );

    const manifest = await parsePresetManifest(manifestPath);
    expect(manifest.fallow).toEqual({
      rules: { 'custom-rule': 'error' },
      checkKeys: ['custom_findings'],
    });
  });

  it('parses compatible versions from a preset manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'preset-compatible-version-manifest-'));
    temporaryDirectories.push(root);
    const manifestPath = join(root, 'manifest.json');
    await writeTextFile(
      manifestPath,
      `${JSON.stringify(
        {
          name: 'compatible-version-fixture',
          requires: [],
          files: [],
          dependencies: [dependency],
          oxlint: { plugins: [], rules: {} },
        },
        null,
        2,
      )}\n`,
    );

    const manifest = await parsePresetManifest(manifestPath);
    expect(manifest.dependencies[0]?.compatibleVersions).toEqual(['1.5.0']);
  });
});
