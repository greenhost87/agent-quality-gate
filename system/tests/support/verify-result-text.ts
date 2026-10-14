import type { CheckResult } from '#system/gate/run/check-result.js';
import type { VerifyResult } from '#system/gate/run/execute-verify.js';
import { formatVerifyResultDiagnostics } from '#system/gate/quality-gate-run/format-diagnostics.js';
import { streamResultFromVerifyResult } from '#system/gate/public-verify/verify-streams.js';

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
