import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach } from 'bun:test';

import { executeVerify } from '../../gate/execute-verify/execute-verify.js';
import { writeTextFile } from '../../process/files/files.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';
import { readFixture } from './fixture-files.js';

const GATE_ROOT = join(import.meta.dir, '../../gate');
export const EXECUTE_VERIFY_REPO_ROOT = join(GATE_ROOT, '..');
export const EXECUTE_VERIFY_FIXTURES_ROOT = join(GATE_ROOT, '.quality-fixtures', 'execute-verify');
export const EXECUTE_VERIFY_FIXTURE_ENTRIES = ['src/index.ts'] as const;

export function useExecuteVerifyProjects(): {
  createTypeScriptProject: (indexFixture: string) => Promise<string>;
  makeTempDirectory: (prefix: string) => Promise<string>;
  runVerify: (
    cwd: string,
    entries?: readonly string[],
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  initializeGitRepository: (cwd: string) => Promise<void>;
  runCommand: (
    command: string,
    args: readonly string[],
    cwd: string,
  ) => Promise<{ exitCode: number; stderr: string; stdout: string }>;
} {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  async function makeTempDirectory(prefix: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), prefix));
    tempDirectories.push(directory);
    return directory;
  }

  async function createTypeScriptProject(indexFixture: string): Promise<string> {
    const source = await readFixture(EXECUTE_VERIFY_FIXTURES_ROOT, indexFixture);
    const cwd = await makeTempDirectory('quality-gate-project-');
    await mkdir(join(cwd, 'src'));
    await writeTextFile(
      join(cwd, 'package.json'),
      `${JSON.stringify(
        {
          name: 'quality-gate-fixture',
          private: true,
          type: 'module',
          main: 'src/index.ts',
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
          },
          include: ['src/**/*.ts'],
        },
        null,
        2,
      )}\n`,
    );
    await writeTextFile(join(cwd, 'src', 'index.ts'), source);
    return cwd;
  }

  async function runVerify(
    cwd: string,
    entries: readonly string[] = EXECUTE_VERIFY_FIXTURE_ENTRIES,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return executeVerify({
      projectRoot: cwd,
      entries,
    });
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

  async function initializeGitRepository(cwd: string): Promise<void> {
    for (const args of [
      ['init', '--quiet'],
      ['add', '.'],
      [
        '-c',
        'user.name=Test User',
        '-c',
        'user.email=test@example.com',
        'commit',
        '--quiet',
        '-m',
        'Initial',
      ],
    ]) {
      const result = await runCommand('git', args, cwd);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr);
      }
    }
  }

  return {
    createTypeScriptProject,
    makeTempDirectory,
    runVerify,
    initializeGitRepository,
    runCommand,
  };
}
