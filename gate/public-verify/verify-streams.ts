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

function ensureTrailingNewline(text: string): string {
  if (text.length === 0 || text.endsWith('\n')) {
    return text;
  }
  return `${text}\n`;
}

function joinStatusAndFailure(status: string, failure: string): string {
  if (status.length === 0) {
    return failure;
  }
  if (failure.length === 0 || status.endsWith('\n')) {
    return `${status}${failure}`;
  }
  return `${status}\n${failure}`;
}

export function streamResultFromVerifyResult(result: VerifyResult): StreamResult {
  const diagnostics = formatVerifyResultDiagnostics({
    ...result,
    // Deferred is failure-path metadata; keep on stderr for failures only via full format.
    deferredCount: result.exitCode === 0 ? undefined : result.deferredCount,
  });
  const body = ensureTrailingNewline(diagnostics);
  if (result.exitCode === 0) {
    return {
      exitCode: 0,
      stdout: `${body}${result.statusStdout ?? ''}`,
      stderr: result.statusStderr ?? '',
    };
  }
  return {
    exitCode: result.exitCode,
    stdout: result.statusStdout ?? '',
    stderr: joinStatusAndFailure(result.statusStderr ?? '', body),
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
