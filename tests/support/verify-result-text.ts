import type { CheckResult } from '../../gate/execute-verify/check-result.js';
import type { VerifyResult } from '../../gate/execute-verify/execute-verify.js';
import { formatVerifyResultDiagnostics } from '../../gate/quality-gate-run/format-diagnostics.js';
import { streamResultFromVerifyResult } from '../../gate/public-verify/verify-streams.js';

/** Render CheckResult findings for assertions (not process streams). */
export function checkPresentedText(result: CheckResult): string {
  return formatVerifyResultDiagnostics(result);
}

/**
 * Full agent/CLI text for a VerifyResult: status streams plus formatted diagnostics.
 * Prefer this over reading nonexistent stdout/stderr finding fields.
 */
export function verifyPresentedText(result: VerifyResult): string {
  const streams = streamResultFromVerifyResult(result);
  return `${streams.stdout}${streams.stderr}`;
}
