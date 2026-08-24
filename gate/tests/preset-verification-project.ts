import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../process/files/files.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';

import { readFixture } from '../../tests/support/fixture-files.js';
import type { CreateProjectOptions } from './preset-verification-project.types.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'verification');

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
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

export async function cleanupPresetVerificationProjects(): Promise<void> {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const result = await runCapturedProcess({ command, args, cwd });
  if (result.error !== undefined) {
    throw result.error;
  }
  return { exitCode: result.exitCode, stderr: result.stderr, stdout: result.stdout };
}

export async function createProject(options: CreateProjectOptions): Promise<string> {
  const cwd = await makeTempDirectory('aqg-preset-project-');
  await mkdir(join(cwd, 'src'));
  const shouldInstall =
    options.install !== false &&
    (options.dependencies !== undefined || Object.keys(options.devDependencies ?? {}).length > 0);
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'preset-fixture',
        private: true,
        type: 'module',
        ...(options.scripts ? { scripts: options.scripts } : {}),
        ...(options.ignoreScripts !== undefined
          ? { ignoreScripts: [...options.ignoreScripts] }
          : {}),
        dependencies: options.dependencies ?? {},
        devDependencies: {
          ...(shouldInstall ? { '@types/bun': '1.4.0' } : {}),
          ...(options.devDependencies ?? {}),
        },
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
          ...(shouldInstall ? { types: ['bun'] } : {}),
        },
        include: shouldInstall ? ['src/**/*.ts', 'system/**/*.ts'] : ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  const fixtureCase = options.fixtureCase ?? 'export-value';
  const source = await readFixture(FIXTURES_ROOT, fixtureCase, 'src/index.ts');
  await writeTextFile(join(cwd, 'src', 'index.ts'), source);
  if (shouldInstall) {
    const install = await runCommand('bun', ['install'], cwd);
    if (install.exitCode !== 0) {
      throw new Error(`bun install failed: ${install.stderr}; ${install.stdout}`);
    }
  }
  return cwd;
}
