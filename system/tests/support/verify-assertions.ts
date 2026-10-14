import { expect } from 'bun:test';

import type { VerifyResult } from '#system/gate/run/execute-verify.js';
import { verifyPresentedText } from './verify-result-text.js';

/** Assert verify passed and its presented text reports success. */
export function expectVerifySuccessText(result: VerifyResult): void {
  expect(result.exitCode).toBe(0);
  expect(verifyPresentedText(result)).toContain('verify: ok');
}

/** Assert verify failed and its presented text contains each expected substring. */
export function expectVerifyFailureText(result: VerifyResult, ...expected: string[]): void {
  expect(result.exitCode).toBe(1);
  const output = verifyPresentedText(result);
  for (const substring of expected) {
    expect(output).toContain(substring);
  }
}
