#!/usr/bin/env bun

import { runCapturedProcess } from '#system/process/run-command/run-command.js';
import { withSourcePackageResolution } from '../source-package-resolution/source-package-resolution.js';
import { resolveBunTestParallelArgs } from './bun-test-parallel.js';
import { resolveBunTestTimeoutMs } from './bun-test-timeout.js';

export function resolvePresetTestArgs(paths: readonly string[]): string[] {
  return [
    'test',
    ...resolveBunTestParallelArgs(),
    '--timeout',
    String(resolveBunTestTimeoutMs()),
    ...paths,
  ];
}

if (import.meta.main) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    process.stderr.write('run-preset-tests: expected one or more test paths\n');
    process.exit(2);
  }

  const result = await withSourcePackageResolution(
    async () =>
      await runCapturedProcess({
        command: 'bun',
        args: resolvePresetTestArgs(paths),
        cwd: process.cwd(),
        inheritOutput: true,
      }),
  );
  process.exitCode = result.exitCode;
}
