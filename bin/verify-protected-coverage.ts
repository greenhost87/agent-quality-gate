#!/usr/bin/env bun

import { runProtectedCoverageStep } from '../src/verify/internal-steps.js';

try {
  process.exitCode = runProtectedCoverageStep();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`verify: failed to compute coverage targets: ${message}\n`);
  process.exitCode = 1;
}
