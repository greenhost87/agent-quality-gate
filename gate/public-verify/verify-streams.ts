import type { VerifyResult } from '../execute-verify/execute-verify.js';

import { firstNonZeroResult } from './preset-verify-result.js';

export function writeVerifyStreams(result: VerifyResult): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
}

export function exitCodeAfterWritingResults(...results: readonly VerifyResult[]): number {
  for (const result of results) {
    writeVerifyStreams(result);
  }
  return firstNonZeroResult(...results)?.exitCode ?? 0;
}
