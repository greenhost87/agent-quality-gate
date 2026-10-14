import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import { ensureGateInstallNodeModules } from '#system/tests/support/gate-install.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  createTempYamlConfig,
  packagesPresetConfig,
  projectConfig,
} from '#system/tests/support/config-fixtures.ts';
import { namedPresetRoots } from '#system/tests/support/preset-fixtures.ts';
import { readGlobalQualityGateConfig } from '#system/config/global-config/global-config.ts';
import { installPresetFromSource } from '#system/scripts/install-preset/install-preset.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const FIXTURES_ROOT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures',
  'global-config',
);
const { makeTempDirectory } = useTrackedTempDirectories();

useIsolatedAgentQualityGateHome();

async function writeConfigFromFixture(fixtureName: string): Promise<string> {
  const configPath = await makeTempDirectory('global-config-');
  const yaml = await readFixture(FIXTURES_ROOT, fixtureName);
  await writeTextFile(join(configPath, 'config.yaml'), yaml);
  return join(configPath, 'config.yaml');
}

async function writeConfig(value: object): Promise<string> {
  return createTempYamlConfig(makeTempDirectory, 'global-config-written-', value);
}

const writeNamedPresetRoot = namedPresetRoots(makeTempDirectory, 'global-config-preset-');

async function writeProjectRoot(): Promise<string> {
  const root = await makeTempDirectory('global-config-project-');
  await mkdir(join(root, 'src'), { recursive: true });
  return root;
}

async function readProjectConfiguration(project: string, extra: object) {
  const configPath = await writeConfig(projectConfig(project, extra));
  return await readGlobalQualityGateConfig(configPath);
}

async function readProjectPresetConfig(project: string, extra: object) {
  return (await readProjectConfiguration(project, extra)).projects[0]?.presetConfig;
}

async function expectPresetConfigFromFixture(
  fixtureName: string,
  expected: Record<string, object>,
): Promise<void> {
  const configPath = await writeConfigFromFixture(fixtureName);
  const config = await readGlobalQualityGateConfig(configPath);
  expect(config.projects[0]?.presetConfig).toEqual(expected);
}

describe('global config presetConfig', () => {
  it('activates and configures presets from one map', async () => {
    const project = await writeProjectRoot();
    const customPreset = await writeNamedPresetRoot('custom-policy');
    await ensureGateInstallNodeModules();
    await installPresetFromSource(customPreset);
    const configPath = await writeConfig(
      projectConfig(project, {
        presets: {
          config: null,
          'custom-policy': { enabled: true },
          baseline: { maxInlineParameterObjectMembers: 3 },
        },
      }),
    );
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presets).toEqual(['config', 'custom-policy', 'baseline']);
    expect(config.projects[0]?.presetConfig).toEqual({
      'custom-policy': { enabled: true },
      baseline: { maxInlineParameterObjectMembers: 3 },
    });
  });

  it('stores nested presetConfig bags without validating preset schemas', async () => {
    await expectPresetConfigFromFixture('valid-module-placement.yaml', {
      layout: {
        placement: {
          directories: ['system/agents'],
          rootExceptions: {
            'system/agents': ['agents.types.ts'],
          },
        },
      },
    });
  });

  it('allows a preset without a presetConfig section', async () => {
    await expectPresetConfigFromFixture('preset-only.yaml', {});
  });

  it('keeps orphaned presetConfig keys when the preset is not listed', async () => {
    const configPath = await writeConfigFromFixture('missing-preset.yaml');
    const config = await readGlobalQualityGateConfig(configPath);
    expect(config.projects[0]?.presets).toEqual(['config']);
    expect(config.projects[0]?.presetConfig).toEqual({
      layout: { placement: { directories: ['system/agents'] } },
    });
  });

  it('stores invalid-looking presetConfig sections as raw objects', async () => {
    await expectPresetConfigFromFixture('invalid-root-exception.yaml', {
      layout: {
        placement: {
          directories: ['system/agents'],
          rootExceptions: {
            'system/database': ['connection.ts'],
          },
        },
      },
    });
  });

  it('stores baseline options under presetConfig.baseline', async () => {
    const project = await writeProjectRoot();
    expect(
      await readProjectPresetConfig(project, {
        presetConfig: {
          baseline: {
            maxInlineParameterObjectMembers: 3,
            noClassSuffixes: ['Error', 'Element'],
          },
        },
      }),
    ).toEqual({
      baseline: {
        maxInlineParameterObjectMembers: 3,
        noClassSuffixes: ['Error', 'Element'],
      },
    });
  });

  it('drops non-object presetConfig section values', async () => {
    const project = await writeProjectRoot();
    expect(
      await readProjectPresetConfig(project, {
        presetConfig: {
          baseline: { maxInlineParameterObjectMembers: 3 },
          broken: true,
        },
      }),
    ).toEqual({
      baseline: { maxInlineParameterObjectMembers: 3 },
    });
  });

  it('ignores flat legacy keys that are not under presetConfig', async () => {
    const project = await writeProjectRoot();
    expect(
      await readProjectPresetConfig(project, {
        baseline: { maxInlineParameterObjectMembers: 3 },
        modulePlacement: { directories: ['system/agents'] },
      }),
    ).toEqual({});
  });
});

describe('global config package presets', () => {
  it('does not activate packages as a preset', async () => {
    const project = await writeProjectRoot();
    const config = await readProjectConfiguration(project, {
      presets: ['packages'],
      presetConfig: packagesPresetConfig({ orders: ['shopify'] }),
    });
    expect(config.projects[0]?.presets).toEqual([]);
    expect(config.projects[0]?.presetConfig).toEqual(packagesPresetConfig({ orders: ['shopify'] }));
  });

  it('accepts home-installed preset names', async () => {
    const project = await writeProjectRoot();
    const optionalSource = await writeNamedPresetRoot('demo-optional');
    await ensureGateInstallNodeModules();
    await installPresetFromSource(optionalSource);
    const config = await readProjectConfiguration(project, {
      presets: ['demo-optional', 'config'],
    });
    expect(config.projects[0]?.presets).toEqual(['demo-optional', 'config']);
  });

  it('drops unknown preset names instead of rejecting the project', async () => {
    const project = await writeProjectRoot();
    const config = await readProjectConfiguration(project, {
      presets: ['not-a-real-optional-preset', 'config'],
    });
    expect(config.projects[0]?.presets).toEqual(['config']);
  });

  it('drops absolute preset paths', async () => {
    const project = await writeProjectRoot();
    const packagesPreset = await writeNamedPresetRoot('packages');
    const config = await readProjectConfiguration(project, {
      presets: [packagesPreset, 'config'],
    });
    expect(config.projects[0]?.presets).toEqual(['config']);
  });

  const conflictCases: Array<{
    title: string;
    entries: string[];
    presets: string[];
    allowedRootModules: string[];
    expectedWarnings: string[];
  }> = [
    {
      title: 'warns when packages + playwright omit playwright.config.ts from allowedRootModules',
      entries: ['src/index.ts'],
      presets: ['layout', 'playwright'],
      allowedRootModules: ['config.ts', 'next.config.ts'],
      expectedWarnings: [
        'verify: preset conflict: packages + playwright require playwright.config.ts in presetConfig.layout.packages.allowedRootModules',
      ],
    },
    {
      title: 'warns when packages lists next.config.ts in entries but not allowedRootModules',
      entries: ['src/index.ts', 'next.config.ts'],
      presets: ['layout'],
      allowedRootModules: ['config.ts'],
      expectedWarnings: [
        'verify: preset conflict: packages requires next.config.ts in presetConfig.layout.packages.allowedRootModules when next.config.ts is in entries',
      ],
    },
    {
      title: 'stays quiet when packages + playwright allowlist includes companion root configs',
      entries: ['src/index.ts', 'next.config.ts', 'playwright.config.ts'],
      presets: ['layout', 'playwright'],
      allowedRootModules: ['config.ts', 'next.config.ts', 'playwright.config.ts'],
      expectedWarnings: [],
    },
  ];
  for (const { title, entries, presets, allowedRootModules, expectedWarnings } of conflictCases) {
    it(title, async () => {
      const project = await writeProjectRoot();
      const configPath = await writeConfig(
        projectConfig(project, {
          entries,
          presets,
          presetConfig: { layout: { packages: { allowedRootModules } } },
        }),
      );
      const config = await readGlobalQualityGateConfig(configPath);
      expect(config.warnings).toEqual(expectedWarnings);
      expect(config.projects[0]?.warnings).toEqual(config.warnings);
    });
  }
});

describe('global verify logging config', () => {
  it('preserves an explicit agent run log setting', async () => {
    const config = await readGlobalQualityGateConfig(
      await writeConfig({ projects: [], verify: { agentRunLogs: false } }),
    );
    expect(config.verify).toEqual({ agentRunLogs: false });
  });

  it('ignores a malformed agent run log setting', async () => {
    const config = await readGlobalQualityGateConfig(
      await writeConfig({ projects: [], verify: { agentRunLogs: 'off' } }),
    );
    expect(config.verify).toBeUndefined();
  });
});

describe('global project configuration', () => {
  it('skips malformed preset config fields', async () => {
    const project = await writeProjectRoot();
    for (const malformed of [{ presets: 'not-an-array' }, { presetConfig: 'not-an-object' }]) {
      const config = await readGlobalQualityGateConfig(
        await writeConfig({
          projects: [{ root: project, entries: ['src/index.ts'], ...malformed }],
        }),
      );
      expect(config.projects).toEqual([]);
    }
  });
});

describe('global config lenient parsing', () => {
  const invalidConfigs = [
    { title: 'invalid YAML', prefix: 'global-config-invalid-yaml-', contents: 'projects: [\n' },
    {
      title: 'projects is not an array',
      prefix: 'global-config-invalid-shape-',
      contents: 'projects: true\n',
    },
  ];
  for (const { title, prefix, contents } of invalidConfigs) {
    it(`returns no projects for ${title}`, async () => {
      const configDirectory = await makeTempDirectory(prefix);
      const configPath = join(configDirectory, 'config.yaml');
      await writeTextFile(configPath, contents);
      const config = await readGlobalQualityGateConfig(configPath);
      expect(config).toEqual({ projects: [], warnings: [] });
    });
  }
});
