import { mkdir } from 'node:fs/promises';

import { join } from 'node:path';
import { writeTextFile } from '#system/process/files/files.js';
import { runCapturedProcess } from '#system/process/run-command/run-command.js';

import { describe, expect, it } from 'bun:test';
import { readGlobalQualityGateConfig } from '#system/config/global-config/global-config.js';
import { executeVerify } from '#system/gate/run/execute-verify.js';
import { streamResultFromVerifyResult } from '#system/gate/public-verify/verify-streams.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.js';
import {
  packagesPresetConfig,
  projectConfig,
  writeYamlConfig,
} from '#system/tests/support/config-fixtures.js';
import { namedPresetRoots } from '#system/tests/support/preset-fixtures.js';
import {
  installManagedFromExample,
  writeJsonProjectFile,
} from '#system/tests/support/project-files.js';
import { requireAllowlistedProject } from './pi-extension-host.js';

useIsolatedAgentQualityGateHome();

const { makeTempDirectory } = useTrackedTempDirectories();

const writeNamedPresetRoot = namedPresetRoots(makeTempDirectory, 'quality-gate-pi-preset-');

async function runCommand(command: string, args: readonly string[], cwd: string): Promise<number> {
  const result = await runCapturedProcess({ command, args, cwd });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.exitCode;
}

describe('pi extension presets', () => {
  it('parses optional presets and drops unknown names and absolute paths', async () => {
    const configDirectory = await makeTempDirectory('quality-gate-pi-presets-');
    const project = await makeTempDirectory('quality-gate-pi-preset-project-');
    const privatePreset = await writeNamedPresetRoot('private-example');
    const withPresets = await writeYamlConfig(
      configDirectory,
      projectConfig(project, { presets: ['database'] }),
    );
    const withPath = await writeYamlConfig(
      await makeTempDirectory('quality-gate-pi-path-'),
      projectConfig(project, { presets: [privatePreset] }),
    );
    const unknown = await writeYamlConfig(
      await makeTempDirectory('quality-gate-pi-unknown-'),
      projectConfig(project, { presets: ['nope'] }),
    );
    const malformed = await writeYamlConfig(
      await makeTempDirectory('quality-gate-pi-malformed-'),
      projectConfig(project, { presets: 'config' }),
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
    const configPath = await writeYamlConfig(
      configDirectory,
      projectConfig(project, { ignorePatterns: ['migrations/**'] }),
    );

    const loaded = await readGlobalQualityGateConfig(configPath);
    expect(loaded.projects[0]?.ignorePatterns).toEqual(['migrations/**']);
  });

  it('stores packages options under presetConfig.layout.packages', async () => {
    const configDirectory = await makeTempDirectory('quality-gate-pi-boundaries-');
    const project = await makeTempDirectory('quality-gate-pi-boundaries-project-');
    const withBoundaries = await writeYamlConfig(
      configDirectory,
      projectConfig(project, {
        presets: ['layout'],
        presetConfig: packagesPresetConfig({ orders: ['shopify'] }),
      }),
    );
    const withoutPackagesKey = await writeYamlConfig(
      await makeTempDirectory('quality-gate-pi-boundaries-missing-'),
      projectConfig(project, {
        presets: ['config'],
        presetConfig: packagesPresetConfig({}),
      }),
    );

    const loaded = await readGlobalQualityGateConfig(withBoundaries);
    expect(loaded.projects[0]?.presets).toEqual(['layout']);
    expect(loaded.projects[0]?.presetConfig).toEqual(packagesPresetConfig({ orders: ['shopify'] }));
    const orphaned = await readGlobalQualityGateConfig(withoutPackagesKey);
    expect(orphaned.projects[0]?.presets).toEqual(['config']);
    expect(orphaned.projects[0]?.presetConfig).toEqual(packagesPresetConfig({}));
  });

  it('forwards configured presets into verify', async () => {
    const cwd = await makeTempDirectory('quality-gate-pi-forward-project-');
    await mkdir(join(cwd, 'src'));
    await writeJsonProjectFile(cwd, 'package.json', {
      name: 'pi-fixture',
      private: true,
      type: 'module',
      dependencies: { valibot: '1.4.2' },
      devDependencies: { '@types/bun': '1.4.0' },
    });
    await writeJsonProjectFile(cwd, 'tsconfig.json', {
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
        target: 'ES2022',
        types: ['bun'],
      },
      include: ['src/**/*.ts', 'system/**/*.ts'],
    });
    await writeTextFile(
      join(cwd, 'src', 'index.ts'),
      'export const token = process.env.API_TOKEN;\n',
    );
    expect(await runCommand('bun', ['install'], cwd)).toBe(0);

    const configPath = await writeYamlConfig(
      await makeTempDirectory('quality-gate-pi-forward-'),
      projectConfig(cwd, { presets: ['config'] }),
    );
    const project = await requireAllowlistedProject(cwd, configPath);

    const first = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
      presets: project.presets,
    });
    expect(first.exitCode).toBe(1);
    expect(streamResultFromVerifyResult(first).stderr).toContain(
      'managed preset files do not match',
    );
    expect(streamResultFromVerifyResult(first).stderr).toContain(
      'example .aqg/config/system/config/environment.ts',
    );

    const examplePath = join(cwd, '.aqg', 'config', 'system', 'config', 'environment.ts');
    const managedPath = join(cwd, 'system', 'config', 'environment.ts');
    await installManagedFromExample(managedPath, examplePath);

    const second = await executeVerify({
      projectRoot: project.root,
      entries: project.entries,
      presets: project.presets,
    });
    expect(second.exitCode).not.toBe(0);
    const secondStreams = streamResultFromVerifyResult(second);
    expect(`${secondStreams.stdout}${secondStreams.stderr}`).toContain('environment-boundaries');
  });
});
