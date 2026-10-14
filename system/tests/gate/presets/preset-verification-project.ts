import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTextFile } from '#system/process/files/files.ts';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import {
  writeJsonProjectFile,
  writeNodeNextTypeScriptConfig,
} from '#system/tests/support/project-files.ts';
import { runTestCommand } from '#system/tests/support/run-command.ts';
import {
  makeTrackedTempDirectory,
  removeTrackedTempDirectories,
} from '#system/tests/support/tracked-temp-directories.ts';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures',
  'verification',
);

export const configDependencies = {
  valibot: '1.4.2',
};
export const databaseDependencies = {
  valibot: '1.4.2',
};
export const databaseDevDependencies = {
  '@testcontainers/postgresql': '12.0.4',
  testcontainers: '12.0.4',
};
export const databaseIgnoreScripts = ['ssh2', 'cpu-features'] as const;
export const cleanSourceFixtureCase = 'clean-config-source' as const;

export async function makeTempDirectory(prefix: string): Promise<string> {
  return await makeTrackedTempDirectory(tempDirectories, prefix);
}

export async function cleanupPresetVerificationProjects(): Promise<void> {
  await removeTrackedTempDirectories(tempDirectories);
}

export async function createProject(options: CreateProjectOptions): Promise<string> {
  const cwd = await makeTempDirectory('aqg-preset-project-');
  await mkdir(join(cwd, 'src'));
  const shouldInstall =
    options.install !== false &&
    (options.dependencies !== undefined || Object.keys(options.devDependencies ?? {}).length > 0);
  await writeJsonProjectFile(cwd, 'package.json', {
    name: 'preset-fixture',
    private: true,
    type: 'module',
    ...(options.scripts ? { scripts: options.scripts } : {}),
    ...(options.ignoreScripts === undefined ? {} : { ignoreScripts: [...options.ignoreScripts] }),
    dependencies: options.dependencies ?? {},
    devDependencies: {
      ...(shouldInstall ? { '@types/bun': '1.4.0' } : {}),
      ...(options.devDependencies ?? {}),
    },
  });
  await writeNodeNextTypeScriptConfig(cwd, {
    include: shouldInstall ? ['src/**/*.ts', 'system/**/*.ts'] : ['src/**/*.ts'],
    ...(shouldInstall ? { types: ['bun'] } : {}),
  });
  const fixtureCase = options.fixtureCase ?? 'export-value';
  const source = await readFixture(FIXTURES_ROOT, fixtureCase, 'src/index.ts');
  await writeTextFile(join(cwd, 'src', 'index.ts'), source);
  if (shouldInstall) {
    const install = await runTestCommand('bun', ['install'], cwd);
    if (install.exitCode !== 0) {
      throw new Error(`bun install failed: ${install.stderr}; ${install.stdout}`);
    }
  }
  return cwd;
}

export type CreateProjectOptions = {
  fixtureCase?: 'clean-config-source' | 'debugger-with-export' | 'export-value' | 'env-token';
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  ignoreScripts?: readonly string[];
  scripts?: Record<string, string>;
  install?: boolean;
};
