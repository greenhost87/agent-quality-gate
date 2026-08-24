import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { readFixture } from '../../tests/support/fixture-files.js';
import { expectRejectedMessage } from '../../tests/support/expect-rejected.js';
import { ensureGateInstallNodeModules } from '../../tests/support/gate-install.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';
import { readGlobalQualityGateConfig } from '../../config/global-config/global-config.js';
import { installPresetFromSource } from '../../scripts/install-preset/install-preset.js';

const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'global-config');
const createdConfigs: string[] = [];

useIsolatedAgentQualityGateHome();

async function writeConfigFromFixture(fixtureName: string): Promise<string> {
  const configPath = await mkdtemp(join(tmpdir(), 'global-config-'));
  createdConfigs.push(configPath);
  const yaml = await readFixture(FIXTURES_ROOT, fixtureName);
  await writeTextFile(join(configPath, 'config.yaml'), yaml);
  return join(configPath, 'config.yaml');
}

async function writeConfig(value: object): Promise<string> {
  const configDirectory = await mkdtemp(join(tmpdir(), 'global-config-written-'));
  createdConfigs.push(configDirectory);
  const configPath = join(configDirectory, 'config.yaml');
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

async function writeNamedPresetRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `global-config-preset-${name}-`));
  createdConfigs.push(root);
  await writeTextFile(
    join(root, 'manifest.json'),
    `${JSON.stringify(
      {
        name,
        requires: [],
        files: [],
        dependencies: [],
        oxlint: { nativePlugins: [], plugins: [], rules: {}, overrides: [] },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

async function writeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'global-config-project-'));
  createdConfigs.push(root);
  await mkdir(join(root, 'src'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(
    createdConfigs.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('global config modulePlacement', () => {
  it('accepts modulePlacement when the module-placement preset is enabled', async () => {
    const configPath = await writeConfigFromFixture('valid-module-placement.yaml');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.modulePlacement).toEqual({
      directories: ['system/agents'],
      rootExceptions: {
        'system/agents': ['agents.types.ts'],
      },
    });
  });

  it('allows module-placement preset without modulePlacement config', async () => {
    const configPath = await writeConfigFromFixture('preset-only.yaml');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.modulePlacement).toBeUndefined();
  });

  it('rejects modulePlacement without the module-placement preset', async () => {
    const configPath = await writeConfigFromFixture('missing-preset.yaml');
    await expectRejectedMessage(
      readGlobalQualityGateConfig(configPath),
      'modulePlacement requires the module-placement preset',
    );
  });

  it('rejects rootExceptions for directories that are not configured', async () => {
    const configPath = await writeConfigFromFixture('invalid-root-exception.yaml');
    await expectRejectedMessage(
      readGlobalQualityGateConfig(configPath),
      'rootExceptions.system/database must name a configured directory',
    );
  });
});

describe('global config baseline', () => {
  it('accepts baseline.maxInlineParameterObjectMembers without listing baseline', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          baseline: { maxInlineParameterObjectMembers: 3 },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.baseline).toEqual({ maxInlineParameterObjectMembers: 3 });
  });

  it('accepts maxInlineParameterObjectMembers -1', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          baseline: { maxInlineParameterObjectMembers: -1 },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.baseline).toEqual({ maxInlineParameterObjectMembers: -1 });
  });

  it('rejects maxInlineParameterObjectMembers below -1', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          baseline: { maxInlineParameterObjectMembers: -2 },
        },
      ],
    });
    await expectRejectedMessage(
      readGlobalQualityGateConfig(configPath),
      'must be -1 or a non-negative integer',
    );
  });
});

describe('global config packageBoundaries', () => {
  it('accepts packageBoundaries when a home-installed packages preset is listed by name', async () => {
    const project = await writeProjectRoot();
    const packagesSource = await writeNamedPresetRoot('packages');
    await ensureGateInstallNodeModules();
    await installPresetFromSource(packagesSource);
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presets: ['packages'],
          packageBoundaries: {
            allowedRootModules: ['config.ts'],
            declaredDependencies: { orders: ['shopify'] },
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presets).toEqual(['packages']);
    expect(config.projects[0]?.packageBoundaries).toEqual({
      allowedRootModules: ['config.ts'],
      declaredDependencies: { orders: ['shopify'] },
    });
  });

  it('rejects unknown preset names that are not shipped or home-installed', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presets: ['not-a-real-optional-preset'],
        },
      ],
    });
    await expectRejectedMessage(
      readGlobalQualityGateConfig(configPath),
      'unknown preset "not-a-real-optional-preset"',
    );
  });

  it('rejects absolute preset paths', async () => {
    const project = await writeProjectRoot();
    const packagesPreset = await writeNamedPresetRoot('packages');
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presets: [packagesPreset],
        },
      ],
    });
    await expectRejectedMessage(
      readGlobalQualityGateConfig(configPath),
      `unknown preset "${packagesPreset}"`,
    );
  });

  it('rejects packageBoundaries without the packages preset', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presets: ['module-placement'],
          packageBoundaries: {
            allowedRootModules: ['config.ts'],
            declaredDependencies: {},
          },
        },
      ],
    });
    await expectRejectedMessage(
      readGlobalQualityGateConfig(configPath),
      'packageBoundaries requires the packages preset',
    );
  });
});
