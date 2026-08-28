#!/usr/bin/env bun

import { runCapturedProcess } from '../../process/run-command/run-command.js';
import { resolveBunTestTimeoutMs } from './bun-test-timeout.js';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stderr.write('run-preset-tests: expected one or more test paths\n');
  process.exit(2);
}

const result = await runCapturedProcess({
  command: 'bun',
  args: ['test', '--parallel', '--timeout', String(resolveBunTestTimeoutMs()), ...paths],
  cwd: process.cwd(),
  inheritOutput: true,
});
process.exit(result.exitCode);
