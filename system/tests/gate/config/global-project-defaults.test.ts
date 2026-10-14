import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';

import { readGlobalQualityGateConfig } from '#system/config/global-config/global-config.ts';
import { writeTextFile } from '#system/process/files/files.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';

const temporaryDirectories: string[] = [];

useIsolatedAgentQualityGateHome();

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeConfig(value: object): Promise<string> {
  const configPath = join(
    await temporaryDirectory('global-project-defaults-config-'),
    'config.yaml',
  );
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('global project defaults', () => {
  it('inherits shared fields and recursively applies project overrides', async () => {
    const firstProject = await temporaryDirectory('global-project-defaults-project-');
    const secondProject = await temporaryDirectory('global-project-defaults-project-');
    const config = await readGlobalQualityGateConfig(
      await writeConfig({
        projectDefaults: {
          root: '/ignored/default/root',
          entries: ['src/index.ts'],
          ignorePatterns: ['generated/**'],
          autoFix: { oxlint: true, fallow: true },
          presets: {
            config: {},
            baseline: {
              maxInlineParameterObjectMembers: 3,
              noClassSuffixes: ['Error'],
            },
          },
        },
        projects: [
          {
            root: firstProject,
            entries: ['src/main.ts'],
            ignorePatterns: ['vendor/**'],
            autoFix: { fallow: false },
            presets: {
              baseline: { maxInlineParameterObjectMembers: 5 },
              playwright: {},
            },
          },
          { root: secondProject },
        ],
      }),
    );

    expect(config.projects).toHaveLength(2);
    expect(config.projects[0]).toMatchObject({
      entries: ['src/main.ts'],
      ignorePatterns: ['vendor/**'],
      autoFix: { oxlint: true, fallow: false },
      presets: ['config', 'baseline', 'playwright'],
      presetConfig: {
        config: {},
        baseline: {
          maxInlineParameterObjectMembers: 5,
          noClassSuffixes: ['Error'],
        },
        playwright: {},
      },
    });
    expect(config.projects[1]).toMatchObject({
      entries: ['src/index.ts'],
      ignorePatterns: ['generated/**'],
      autoFix: { oxlint: true, fallow: true },
    });
  });

  it('rejects malformed autoFix settings instead of silently enabling fixes', async () => {
    const root = await temporaryDirectory('global-project-defaults-project-');
    const config = await readGlobalQualityGateConfig(
      await writeConfig({
        projects: [
          { root, entries: ['src/index.ts'], autoFix: { oxlint: true } },
          { root: '/invalid/fix-type', entries: ['src/index.ts'], autoFix: { fallow: 'yes' } },
          { root: '/invalid/fix-key', entries: ['src/index.ts'], autoFix: { everything: true } },
        ],
      }),
    );
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0]?.autoFix).toEqual({ oxlint: true });
  });

  it('ignores malformed project defaults', async () => {
    const project = await temporaryDirectory('global-project-defaults-project-');
    const config = await readGlobalQualityGateConfig(
      await writeConfig({
        projectDefaults: true,
        projects: [{ root: project, entries: ['src/index.ts'] }],
      }),
    );
    expect(config.projects).toHaveLength(1);
  });

  it('does not use a default root for project identity', async () => {
    const config = await readGlobalQualityGateConfig(
      await writeConfig({
        projectDefaults: { root: '/default/root', entries: ['src/index.ts'] },
        projects: [{}],
      }),
    );
    expect(config.projects).toEqual([]);
  });
});
