import type { CheckResult } from '../execute-verify/check-result.js';
import type { VerifyResult } from '../execute-verify/execute-verify.js';
import { formatVerifyResultDiagnostics } from '../quality-gate-run/format-diagnostics.js';

/** Process/stream bag for self-verify scripts that are not diagnostic checks. */
export type StreamResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function isStreamResult(result: VerifyResult | StreamResult): result is StreamResult {
  return 'stdout' in result && typeof result.stdout === 'string' && !('diagnostics' in result);
}

export function streamResultFromVerifyResult(result: VerifyResult): StreamResult {
  const diagnostics = formatVerifyResultDiagnostics({
    ...result,
    // Deferred is failure-path metadata; keep on stderr for failures only via full format.
    deferredCount: result.exitCode === 0 ? undefined : result.deferredCount,
  });
  if (result.exitCode === 0) {
    const body =
      diagnostics.length > 0 ? (diagnostics.endsWith('\n') ? diagnostics : `${diagnostics}\n`) : '';
    return {
      exitCode: 0,
      stdout: `${body}${result.statusStdout ?? ''}`,
      stderr: result.statusStderr ?? '',
    };
  }
  const failureBody =
    diagnostics.length > 0 ? (diagnostics.endsWith('\n') ? diagnostics : `${diagnostics}\n`) : '';
  return {
    exitCode: result.exitCode,
    stdout: result.statusStdout ?? '',
    stderr: `${result.statusStderr ?? ''}${failureBody}`,
  };
}

export function streamResultFromCheckResult(result: CheckResult): StreamResult {
  return streamResultFromVerifyResult(result);
}

export function writeVerifyStreams(result: VerifyResult | StreamResult): void {
  if (isStreamResult(result)) {
    if (result.stdout.length > 0) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr.length > 0) {
      process.stderr.write(result.stderr);
    }
    return;
  }
  writeVerifyStreams(streamResultFromVerifyResult(result));
}

export function exitCodeAfterWritingResults(
  ...results: readonly (VerifyResult | StreamResult)[]
): number {
  for (const result of results) {
    writeVerifyStreams(result);
  }
  return results.find((result) => result.exitCode !== 0)?.exitCode ?? 0;
}
