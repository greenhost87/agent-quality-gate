#!/usr/bin/env bun

import { runVerifyCli } from '../src/verify/index.js';
import { runMarkdownHeadingsStep, runProtectedCoverageStep } from '../src/verify/internal-steps.js';

async function runInternalStep(argv: readonly string[]): Promise<number | null> {
  if (argv[0] !== '--agent-quality-gate-internal') {
    return null;
  }
  const stepName = argv[1];
  if (stepName === 'protected-coverage') {
    return runProtectedCoverageStep();
  }
  if (stepName === 'markdown-headings') {
    return runMarkdownHeadingsStep(argv.slice(2));
  }
  if (stepName === 'tool') {
    const { runInternalVerifyTool } = await import('../src/verify/internal-tools.js');
    return runInternalVerifyTool({ stepName: argv[2] ?? '<unknown>', args: argv.slice(3) });
  }
  process.stderr.write(`verify: unknown internal step "${String(stepName)}"\n`);
  return 2;
}

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  process.exitCode = (await runInternalStep(process.argv.slice(2))) ?? (await runVerifyCli());
}
