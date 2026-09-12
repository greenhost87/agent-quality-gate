import { join } from 'node:path';

import { afterEach } from 'bun:test';

import { executeVerify, type VerifyResult } from '../../gate/execute-verify/execute-verify.js';
import { writeTextFile } from '../../process/files/files.js';
import { readFixture } from './fixture-files.js';
import { writeNodeNextProjectScaffold } from './project-files.js';
import { runTestCommand } from './run-command.js';
import {
  makeTrackedTempDirectory,
  removeTrackedTempDirectories,
} from './tracked-temp-directories.js';

const GATE_ROOT = join(import.meta.dir, '../../gate');
export const EXECUTE_VERIFY_REPO_ROOT = join(GATE_ROOT, '..');
export const EXECUTE_VERIFY_FIXTURES_ROOT = join(GATE_ROOT, '.quality-fixtures', 'execute-verify');
export const EXECUTE_VERIFY_FIXTURE_ENTRIES = ['src/index.ts'] as const;

export function useExecuteVerifyProjects(): {
  createTypeScriptProject: (indexFixture: string) => Promise<string>;
  makeTempDirectory: (prefix: string) => Promise<string>;
  runVerify: (cwd: string, entries?: readonly string[]) => Promise<VerifyResult>;
  initializeGitRepository: (cwd: string) => Promise<void>;
  runCommand: (
    command: string,
    args: readonly string[],
    cwd: string,
  ) => Promise<{ exitCode: number; stderr: string; stdout: string }>;
} {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await removeTrackedTempDirectories(tempDirectories);
  });

  async function makeTempDirectory(prefix: string): Promise<string> {
    return await makeTrackedTempDirectory(tempDirectories, prefix);
  }

  async function createTypeScriptProject(indexFixture: string): Promise<string> {
    const source = await readFixture(EXECUTE_VERIFY_FIXTURES_ROOT, indexFixture);
    const cwd = await makeTempDirectory('quality-gate-project-');
    await writeNodeNextProjectScaffold(cwd, 'quality-gate-fixture');
    await writeTextFile(join(cwd, 'src', 'index.ts'), source);
    return cwd;
  }

  async function runVerify(
    cwd: string,
    entries: readonly string[] = EXECUTE_VERIFY_FIXTURE_ENTRIES,
  ): Promise<VerifyResult> {
    return await executeVerify({
      projectRoot: cwd,
      entries,
    });
  }

  async function runCommand(
    command: string,
    args: readonly string[],
    cwd: string,
  ): Promise<{ exitCode: number; stderr: string; stdout: string }> {
    return await runTestCommand(command, args, cwd);
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
