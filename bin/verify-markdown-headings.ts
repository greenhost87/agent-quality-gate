#!/usr/bin/env bun

import { runMarkdownHeadingsStep } from '../src/verify/internal-steps.js';

try {
  process.exitCode = runMarkdownHeadingsStep(Bun.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`verify: failed to check markdown headings: ${message}\n`);
  process.exitCode = 1;
}
