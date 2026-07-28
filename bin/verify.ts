#!/usr/bin/env node

import { runVerifyCli } from '../src/verify/cli.js';
import { runLintDirectiveCheck } from '../src/verify/lint-directives.js';

async function runInternalStep(argv: readonly string[]): Promise<number | null> {
  if (argv[0] !== '--agent-quality-gate-internal') {
    return null;
  }
  if (argv[1] === 'lint-directives') {
    return runLintDirectiveCheck(process.cwd());
  }
  process.stderr.write(`verify: unknown internal step "${String(argv[1])}"\n`);
  return 2;
}

process.exitCode = (await runInternalStep(process.argv.slice(2))) ?? (await runVerifyCli());
