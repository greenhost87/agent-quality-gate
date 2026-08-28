import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile, readTextFile } from '../../../process/files/files.js';
import { runCapturedProcess } from '../../../process/run-command/run-command.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../../config/global-config/global-config.js';
import { executeVerify } from '../../../gate/execute-verify/execute-verify.js';
import { installPresetFromSource } from '../../../scripts/install-preset/install-preset.js';
import { ensureGateInstallNodeModules } from '../../../tests/support/gate-install.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeGlobalConfig(directory: string, value: object): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

async function writeNamedPresetRoot(name: string): Promise<string> {
  const root = await makeTempDirectory(`quality-gate-pi-preset-${name}-`);
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

async function runCommand(command: string, args: readonly string[], cwd: string): Promise<number> {
  const result = await runCapturedProcess({ command, args, cwd });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.exitCode;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('pi extension presets', () => {
  it('parses optional presets and drops unknown names and absolute paths', async () => {
    const configDirectory = await makeTempDirectory('quality-gate-pi-presets-');
    const project = await makeTempDirectory('quality-gate-pi-preset-project-');
    const privatePreset = await writeNamedPresetRoot('private-example');
    const withPresets = await writeGlobalConfig(configDirectory, {
      projects: [{ root: project, entries: ['src/index.ts'], presets: ['database'] }],
    });
    const withPath = await writeGlobalConfig(await makeTempDirectory('quality-gate-pi-path-'), {
      projects: [{ root: project, entries: ['src/index.ts'], presets: [privatePreset] }],
    });
    const unknown = await writeGlobalConfig(await makeTempDirectory('quality-gate-pi-unknown-'), {
      projects: [{ root: project, entries: ['src/index.ts'], presets: ['nope'] }],
    });
    const malformed = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-pi-malformed-'),
      {
        projects: [{ root: project, entries: ['src/index.ts'], presets: 'config' }],
      },
    );

    const loaded = await readGlobalQualityGateConfig(withPresets);
    expect(loaded.projects[0]?.presets).toEqual(['database']);
    expect((await readGlobalQualityGateConfig(withPath)).projects[0]?.presets).toEqual([]);
    expect((await readGlobalQualityGateConfig(unknown)).projects[0]?.presets).toEqual([]);
    expect((await readGlobalQualityGateConfig(malformed)).projects).toEqual([]);
  });

  it('parses project ignorePatterns', async () => {
    const configDirectory = await makeTempDirectory('quality-gate-pi-ignore-');
    const project = await makeTempDirectory('quality-gate-pi-ignore-project-');
    const configPath = await writeGlobalConfig(configDirectory, {
      projects: [
        {
          root: project,
          entries: ['src/index.ts'],
          ignorePatterns: ['migrations/**'],
        },
      ],
    });

    const loaded = await readGlobalQualityGateConfig(configPath);
    expect(loaded.projects[0]?.ignorePatterns).toEqual(['migrations/**']);
  });

  it('stores packages options under presetConfig.packages', async () => {
    const configDirectory = await makeTempDirectory('quality-gate-pi-boundaries-');
    const project = await makeTempDirectory('quality-gate-pi-boundaries-project-');
    const packagesSource = await writeNamedPresetRoot('packages');
    await ensureGateInstallNodeModules();
    await installPresetFromSource(packagesSource);
    const withBoundaries = await writeGlobalConfig(configDirectory, {
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
    const withoutPackagesKey = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-pi-boundaries-missing-'),
      {
        projects: [
          {
            root: project,
            entries: ['src/index.ts'],
            presets: ['config'],
            presetConfig: {
              packages: {
                allowedRootModules: ['config.ts'],
                declaredDependencies: {},
              },
            },
          },
        ],
      },
    );

    const loaded = await readGlobalQualityGateConfig(withBoundaries);
    expect(loaded.projects[0]?.presetConfig).toEqual({
      packages: {
        allowedRootModules: ['config.ts'],
        declaredDependencies: { orders: ['shopify'] },
      },
    });
    const orphaned = await readGlobalQualityGateConfig(withoutPackagesKey);
    expect(orphaned.projects[0]?.presets).toEqual(['config']);
    expect(orphaned.projects[0]?.presetConfig).toEqual({
      packages: {
        allowedRootModules: ['config.ts'],
        declaredDependencies: {},
      },
    });
  });

  it('forwards configured presets into verify', async () => {
    const cwd = await makeTempDirectory('quality-gate-pi-forward-project-');
    await mkdir(join(cwd, 'src'));
    await writeTextFile(
      join(cwd, 'package.json'),
      `${JSON.stringify(
        {
          name: 'pi-fixture',
          private: true,
          type: 'module',
          dependencies: { valibot: '1.4.2' },
          devDependencies: { '@types/bun': '1.4.0' },
        },
        null,
        2,
      )}\n`,
    );
    await writeTextFile(
      join(cwd, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            noEmit: true,
            strict: true,
            target: 'ES2022',
            types: ['bun'],
          },
          include: ['src/**/*.ts', 'system/**/*.ts'],
        },
        null,
        2,
      )}\n`,
    );
    await writeTextFile(
      join(cwd, 'src', 'index.ts'),
      'export const token = process.env.API_TOKEN;\n',
    );
    expect(await runCommand('bun', ['install'], cwd)).toBe(0);

    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-pi-forward-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'], presets: ['config'] }],
      },
    );
    const project = findProjectForCwd(
      cwd,
      (await readGlobalQualityGateConfig(configPath)).projects,
    );
    if (project === undefined) {
      throw new Error('expected allowlisted project');
    }

    const first = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
      presets: project.presets,
    });
    expect(first.exitCode).toBe(1);
    expect(first.stderr).toContain('managed preset files do not match');
    expect(first.stderr).toContain('example .aqg/config/system/config/environment.ts');

    const examplePath = join(cwd, '.aqg', 'config', 'system', 'config', 'environment.ts');
    const managedPath = join(cwd, 'system', 'config', 'environment.ts');
    await mkdir(join(cwd, 'system', 'config'), { recursive: true });
    await writeTextFile(managedPath, await readTextFile(examplePath));

    const second = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
      presets: project.presets,
    });
    expect(second.exitCode).not.toBe(0);
    expect(second.stdout + second.stderr).toContain('environment-boundaries');
  });
});
