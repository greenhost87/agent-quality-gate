import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';

import { readGlobalQualityGateConfig } from '../../../config/global-config/global-config.js';
import { writeTextFile } from '../../../process/files/files.js';
import { installPresetFromSource } from '../../../scripts/install-preset/install-preset.js';
import { ensureGateInstallNodeModules } from '../../../tests/support/gate-install.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const FIXTURE_PROJECT = join(
  import.meta.dir,
  '../../.quality-fixtures/gate-conflict-packages-playwright/project',
);
const PACKAGES_PRESET = join(import.meta.dir, '../fixtures/packages-preset');

const createdConfigs: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdConfigs.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function writeConfig(value: object): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'gate-conflict-config-'));
  createdConfigs.push(directory);
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

describe('gate-conflict-packages-playwright fixture', () => {
  it('flags packages + playwright without companion root allowlist entries', async () => {
    await ensureGateInstallNodeModules();
    await installPresetFromSource(PACKAGES_PRESET);
    const configPath = await writeConfig({
      projects: [
        {
          root: FIXTURE_PROJECT,
          entries: ['src/index.ts', 'next.config.ts', 'playwright.config.ts'],
          presets: ['packages', 'playwright'],
          presetConfig: {
            packages: {
              allowedRootModules: ['config.ts'],
            },
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.warnings).toContain(
      'verify: preset conflict: packages + playwright require playwright.config.ts in presetConfig.packages.allowedRootModules',
    );
    expect(config.warnings).toContain(
      'verify: preset conflict: packages requires next.config.ts in presetConfig.packages.allowedRootModules when next.config.ts is in entries',
    );
  });

  it('accepts the phoenix-style allowlist for companion root configs', async () => {
    await ensureGateInstallNodeModules();
    await installPresetFromSource(PACKAGES_PRESET);
    const configPath = await writeConfig({
      projects: [
        {
          root: FIXTURE_PROJECT,
          entries: ['src/index.ts', 'next.config.ts', 'playwright.config.ts'],
          presets: ['packages', 'playwright'],
          presetConfig: {
            packages: {
              allowedRootModules: ['config.ts', 'next.config.ts', 'playwright.config.ts'],
            },
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.warnings).toEqual([]);
  });
});
