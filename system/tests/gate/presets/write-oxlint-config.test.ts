import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { packagedAssetsDirectory } from '#system/config/packaged-assets/packaged-assets.ts';
import { writeOxlintConfigForProject } from '#system/presets/write-oxlint-config.ts';
import { readTextFile } from '#system/process/files/files.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { tempDirectories } = useTrackedTempDirectories();

test('does not load JS plugins when all their configured rules are off', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'oxlint-plugin-rules-'));
  tempDirectories.push(projectRoot);

  const configPath = await writeOxlintConfigForProject(
    projectRoot,
    packagedAssetsDirectory(),
    [
      { name: 'disabled', absoluteSpecifier: '/unused/disabled.ts' },
      { name: 'enabled', absoluteSpecifier: '/unused/enabled.ts' },
      { name: 'overridden', absoluteSpecifier: '/unused/overridden.ts' },
    ],
    {
      'disabled/rule': 'off',
      'enabled/rule': 'error',
      'overridden/base-rule': 'off',
    },
    [],
    [
      {
        files: ['tests/**'],
        rules: { 'overridden/test-rule': 'warn' },
      },
    ],
  );

  const configText = await readTextFile(configPath);
  const config = JSON.parse(configText.replace(/^export default /u, '').replace(/;\s*$/u, ''));
  const pluginNames = config.jsPlugins.map((plugin: { name: string }) => plugin.name);

  expect(pluginNames).not.toContain('disabled');
  expect(pluginNames).toContain('enabled');
  expect(pluginNames).toContain('overridden');
});
