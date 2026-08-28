import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { readFixture } from '../../../tests/support/fixture-files.js';
import { ensureGateInstallNodeModules } from '../../../tests/support/gate-install.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import { readGlobalQualityGateConfig } from '../../../config/global-config/global-config.js';
import { installPresetFromSource } from '../../../scripts/install-preset/install-preset.js';

const FIXTURES_ROOT = join(import.meta.dir, '../..', '.quality-fixtures', 'global-config');
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

describe('global config presetConfig', () => {
  it('stores nested presetConfig bags without validating preset schemas', async () => {
    const configPath = await writeConfigFromFixture('valid-module-placement.yaml');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presetConfig).toEqual({
      'module-placement': {
        directories: ['system/agents'],
        rootExceptions: {
          'system/agents': ['agents.types.ts'],
        },
      },
    });
  });

  it('allows a preset without a presetConfig section', async () => {
    const configPath = await writeConfigFromFixture('preset-only.yaml');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presetConfig).toEqual({});
  });

  it('keeps orphaned presetConfig keys when the preset is not listed', async () => {
    const configPath = await writeConfigFromFixture('missing-preset.yaml');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presets).toEqual(['config']);
    expect(config.projects[0]?.presetConfig).toEqual({
      'module-placement': {
        directories: ['system/agents'],
      },
    });
  });

  it('stores invalid-looking presetConfig sections as raw objects', async () => {
    const configPath = await writeConfigFromFixture('invalid-root-exception.yaml');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presetConfig).toEqual({
      'module-placement': {
        directories: ['system/agents'],
        rootExceptions: {
          'system/database': ['connection.ts'],
        },
      },
    });
  });

  it('stores baseline options under presetConfig.baseline', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presetConfig: {
            baseline: {
              maxInlineParameterObjectMembers: 3,
              noClassSuffixes: ['Error', 'Element'],
            },
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presetConfig).toEqual({
      baseline: {
        maxInlineParameterObjectMembers: 3,
        noClassSuffixes: ['Error', 'Element'],
      },
    });
  });

  it('drops non-object presetConfig section values', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presetConfig: {
            baseline: { maxInlineParameterObjectMembers: 3 },
            broken: true,
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presetConfig).toEqual({
      baseline: { maxInlineParameterObjectMembers: 3 },
    });
  });

  it('ignores flat legacy keys that are not under presetConfig', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          baseline: { maxInlineParameterObjectMembers: 3 },
          modulePlacement: { directories: ['system/agents'] },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presetConfig).toEqual({});
  });
});

describe('global config package presets', () => {
  it('accepts home-installed preset names and stores packages presetConfig', async () => {
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
          presetConfig: {
            packages: {
              allowedRootModules: ['config.ts'],
              declaredDependencies: { orders: ['shopify'] },
            },
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presets).toEqual(['packages']);
    expect(config.projects[0]?.presetConfig).toEqual({
      packages: {
        allowedRootModules: ['config.ts'],
        declaredDependencies: { orders: ['shopify'] },
      },
    });
  });

  it('drops unknown preset names instead of rejecting the project', async () => {
    const project = await writeProjectRoot();
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presets: ['not-a-real-optional-preset', 'config'],
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presets).toEqual(['config']);
  });

  it('drops absolute preset paths', async () => {
    const project = await writeProjectRoot();
    const packagesPreset = await writeNamedPresetRoot('packages');
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presets: [packagesPreset, 'config'],
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presets).toEqual(['config']);
  });

  it('warns when packages + playwright omit playwright.config.ts from allowedRootModules', async () => {
    const project = await writeProjectRoot();
    const packagesSource = await writeNamedPresetRoot('packages');
    await ensureGateInstallNodeModules();
    await installPresetFromSource(packagesSource);
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          presets: ['packages', 'playwright'],
          presetConfig: {
            packages: {
              allowedRootModules: ['config.ts', 'next.config.ts'],
            },
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.warnings).toEqual([
      'verify: preset conflict: packages + playwright require playwright.config.ts in presetConfig.packages.allowedRootModules',
    ]);
    expect(config.projects[0]?.warnings).toEqual(config.warnings);
  });

  it('warns when packages lists next.config.ts in entries but not allowedRootModules', async () => {
    const project = await writeProjectRoot();
    const packagesSource = await writeNamedPresetRoot('packages');
    await ensureGateInstallNodeModules();
    await installPresetFromSource(packagesSource);
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
          entries: ['src/index.ts', 'next.config.ts'],
          presets: ['packages'],
          presetConfig: {
            packages: {
              allowedRootModules: ['config.ts'],
            },
          },
        },
      ],
    });
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.warnings).toEqual([
      'verify: preset conflict: packages requires next.config.ts in presetConfig.packages.allowedRootModules when next.config.ts is in entries',
    ]);
  });

  it('stays quiet when packages + playwright allowlist includes companion root configs', async () => {
    const project = await writeProjectRoot();
    const packagesSource = await writeNamedPresetRoot('packages');
    await ensureGateInstallNodeModules();
    await installPresetFromSource(packagesSource);
    const configPath = await writeConfig({
      projects: [
        {
          root: project,
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
    expect(config.projects[0]?.warnings).toEqual([]);
  });
});

describe('global config lenient parsing', () => {
  it('returns no projects for invalid YAML', async () => {
    const configDirectory = await mkdtemp(join(tmpdir(), 'global-config-invalid-yaml-'));
    createdConfigs.push(configDirectory);
    const configPath = join(configDirectory, 'config.yaml');
    await writeTextFile(configPath, 'projects: [\n');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config).toEqual({ projects: [], warnings: [] });
  });

  it('returns no projects when projects is not an array', async () => {
    const configDirectory = await mkdtemp(join(tmpdir(), 'global-config-invalid-shape-'));
    createdConfigs.push(configDirectory);
    const configPath = join(configDirectory, 'config.yaml');
    await writeTextFile(configPath, 'projects: true\n');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config).toEqual({ projects: [], warnings: [] });
  });
});
