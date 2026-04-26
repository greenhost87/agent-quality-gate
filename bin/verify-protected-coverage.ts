#!/usr/bin/env bun

import { resolveVerifyTargets } from '../src/verify/targets.js';

function isDebugEnabled(): boolean {
  const value = process.env.VERIFY_DEBUG;
  return value === '1' || value === 'true';
}

function main(): number {
  const targets = resolveVerifyTargets(process.cwd());
  if (isDebugEnabled()) {
    process.stderr.write(
      [
        `verify: debug coverage eslint=${targets.eslint.length}`,
        `verify: debug coverage markdown=${targets.markdown.length}`,
        `verify: debug coverage tsc=${targets.tsc.length}`,
        `verify: debug coverage jscpd=${targets.jscpd.length}`,
      ].join('\n')
    );
    process.stderr.write('\n');
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`verify: failed to compute coverage targets: ${message}\n`);
  process.exitCode = 1;
}
