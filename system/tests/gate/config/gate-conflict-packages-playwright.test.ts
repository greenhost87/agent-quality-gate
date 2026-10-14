import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { readGlobalQualityGateConfig } from '#system/config/global-config/global-config.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import { createTempYamlConfig } from '#system/tests/support/config-fixtures.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

useIsolatedAgentQualityGateHome();

const FIXTURE_PROJECT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures/gate-conflict-packages-playwright/project',
);

const { makeTempDirectory } = useTrackedTempDirectories();

async function writeConfig(value: object): Promise<string> {
  return createTempYamlConfig(makeTempDirectory, 'gate-conflict-config-', value);
}

function packagesPlaywrightConfig(allowedRootModules: string[]): object {
  return {
    projects: [
      {
        root: FIXTURE_PROJECT,
        entries: ['src/index.ts', 'next.config.ts', 'playwright.config.ts'],
        presets: ['layout', 'playwright'],
        presetConfig: { layout: { packages: { allowedRootModules } } },
      },
    ],
  };
}

describe('gate-conflict-packages-playwright fixture', () => {
  it('ignores obsolete top-level packages config', async () => {
    const config = await readGlobalQualityGateConfig(
      await writeConfig({
        projects: [
          {
            root: FIXTURE_PROJECT,
            entries: ['src/index.ts', 'playwright.config.ts'],
            presets: ['layout', 'playwright'],
            presetConfig: { packages: { allowedRootModules: ['config.ts'] } },
          },
        ],
      }),
    );
    expect(config.warnings).toEqual([]);
  });

  it('flags packages + playwright without companion root allowlist entries', async () => {
    const configPath = await writeConfig(packagesPlaywrightConfig(['config.ts']));
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.warnings).toContain(
      'verify: preset conflict: packages + playwright require playwright.config.ts in presetConfig.layout.packages.allowedRootModules',
    );
    expect(config.warnings).toContain(
      'verify: preset conflict: packages requires next.config.ts in presetConfig.layout.packages.allowedRootModules when next.config.ts is in entries',
    );
  });

  it('accepts the phoenix-style allowlist for companion root configs', async () => {
    const configPath = await writeConfig(
      packagesPlaywrightConfig(['config.ts', 'next.config.ts', 'playwright.config.ts']),
    );
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.warnings).toEqual([]);
  });
});
