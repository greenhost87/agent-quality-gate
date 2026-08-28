#!/usr/bin/env bun

import { createCli, parseCli, reportCommandError } from '../../process/command/command.js';
import type { VerifyResult } from '../../gate/execute-verify/execute-verify.js';
import { formatTestOk } from '../../gate/execute-verify/verify-ok-message.js';
import {
  exitCodeAfterWritingResults,
  writeVerifyStreams,
} from '../../gate/public-verify/verify-streams.js';
import {
  testLocalPresetPackIntegrations,
  testLocalPresetPacks,
} from '../self-verify/preset-pack-run.js';
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

export function parseSelfTestArgs(argv: readonly string[]): ParseSelfTestArgsResult {
  const program = createCli('test').option(
    '--integration',
    'pack `test:integration` scripts (same as local-build preflight)',
  );
  if (parseCli(program, argv) === 'help') {
    return 'help';
  }
  return {
    mode: program.opts<{ integration?: boolean }>().integration === true ? 'integration' : 'unit',
  };
}

export const SELF_TEST_USAGE = `Usage: bun run test [--integration]

Build the release package and run repository / pack unit tests, or run pack
integration tests only.

  (default)       build:release, root Bun suite, pack unit tests
  --integration   pack \`test:integration\` scripts (same as local-build preflight)
  -h, --help      Show this help

`;

export function printSelfTestUsage(): void {
  process.stdout.write(SELF_TEST_USAGE);
}

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

async function runUnitSelfTest(projectRoot: string): Promise<number> {
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
  return exitCodeAfterWritingResults(repository, packs);
}

async function runIntegrationSelfTest(projectRoot: string): Promise<number> {
  return exitCodeAfterWritingResults(await testLocalPresetPackIntegrations(projectRoot));
}

export async function runSelfTest(args: SelfTestArgs, projectRoot: string): Promise<number> {
  if (args.mode === 'integration') {
    return runIntegrationSelfTest(projectRoot);
  }
  return runUnitSelfTest(projectRoot);
}

if (import.meta.main) {
  try {
    const parsed = parseSelfTestArgs(process.argv.slice(2));
    if (parsed === 'help') {
      printSelfTestUsage();
    } else {
      process.exitCode = await runSelfTest(parsed, process.cwd());
    }
  } catch (error) {
    reportCommandError('test', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}

export const SELF_TEST_MODES = ['unit', 'integration'] as const;

export type SelfTestMode = (typeof SELF_TEST_MODES)[number];

export type SelfTestArgs = {
  mode: SelfTestMode;
};

export type ParseSelfTestArgsResult = SelfTestArgs | 'help';
