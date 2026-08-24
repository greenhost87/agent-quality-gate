#!/usr/bin/env bun

import { rejectUnexpectedArgument, reportCommandError } from '../../process/command/command.js';
import type { VerifyResult } from '../../gate/execute-verify/execute-verify.types.js';
import { formatTestOk } from '../../gate/execute-verify/verify-ok-message.js';
import { exitCodeAfterWritingResults, writeVerifyStreams } from '../self-verify/cli.js';
import { testLocalPresetPacks } from '../self-verify/preset-pack-run.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';
import { runRequired } from '../run-required/run-required.js';

const ROOT_TEST_ARGS = [
  'test',
  '--parallel',
  './adapters',
  './scripts',
  './gate/tests',
  './presets/baseline/tests',
  './presets/playwright/tests',
  '--timeout',
  '30000',
] as const;

async function runRootTests(projectRoot: string): Promise<VerifyResult> {
  const startedAt = performance.now();
  const result = await runCapturedProcess({
    command: 'bun',
    args: [...ROOT_TEST_ARGS],
    cwd: projectRoot,
  });
  if (result.exitCode !== 0) {
    return result;
  }
  return {
    exitCode: 0,
    stdout: formatTestOk('repository', Math.round(performance.now() - startedAt)),
    stderr: '',
  };
}

if (rejectUnexpectedArgument('test')) {
  process.exitCode = 2;
} else {
  try {
    const projectRoot = process.cwd();
    const buildStartedAt = performance.now();
    runRequired('bun', ['run', 'build:release'], projectRoot, true);
    writeVerifyStreams({
      exitCode: 0,
      stdout: formatTestOk('build:release', Math.round(performance.now() - buildStartedAt)),
      stderr: '',
    });

    const [repository, packs] = await Promise.all([
      runRootTests(projectRoot),
      testLocalPresetPacks(projectRoot),
    ]);
    process.exitCode = exitCodeAfterWritingResults(repository, packs);
  } catch (error) {
    reportCommandError('test', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}
