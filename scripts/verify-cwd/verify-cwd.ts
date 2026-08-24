#!/usr/bin/env bun

import { resolve } from 'node:path';

import { reportCommandError } from '../../process/command/command.js';
import {
  executeQualityGateForCwd,
  toolOutput,
} from '../../gate/quality-gate-run/quality-gate-run.js';

const rawCwd = process.argv[2];
if (rawCwd === undefined || rawCwd.length === 0) {
  process.stderr.write('verify-cwd: missing absolute workspace cwd\n');
  process.exitCode = 2;
} else if (process.argv[3] !== undefined) {
  process.stderr.write(`verify-cwd: unexpected argument "${process.argv[3]}"\n`);
  process.exitCode = 2;
} else {
  try {
    const cwd = resolve(rawCwd);
    const run = await executeQualityGateForCwd(cwd);
    const text = await toolOutput(run);
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
    process.exitCode = run.kind === 'ran' ? run.result.exitCode : 0;
  } catch (error) {
    reportCommandError('verify-cwd', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}
