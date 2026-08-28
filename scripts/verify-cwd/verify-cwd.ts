#!/usr/bin/env bun

import { resolve } from 'node:path';

import { createCli, reportCommandError, runCli } from '../../process/command/command.js';
import {
  executeQualityGateForCwd,
  toolOutput,
} from '../../gate/quality-gate-run/quality-gate-run.js';

const program = createCli('verify-cwd').argument('<cwd>', 'Absolute workspace cwd');

try {
  await runCli(
    program,
    process.argv.slice(2),
    'Usage: bun run verify:cwd -- <absolute-cwd>',
    async () => {
      const rawCwd = program.args[0];
      if (rawCwd === undefined || rawCwd.length === 0) {
        throw new Error('missing absolute workspace cwd');
      }
      const cwd = resolve(rawCwd);
      const run = await executeQualityGateForCwd(cwd);
      const text = await toolOutput(run);
      process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
      process.exitCode = run.kind === 'ran' ? run.result.exitCode : 0;
    },
  );
} catch (error) {
  reportCommandError('verify-cwd', error instanceof Error ? error : String(error));
  process.exitCode = 2;
}
