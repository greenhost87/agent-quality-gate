import type { VerifyResult } from '../execute-verify/execute-verify.js';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
  renderOpaqueAndFailure,
} from './present-diagnostics.js';

/**
 * Deterministic full-path render of a VerifyResult for CLI / hint materialization.
 * Does not apply path-prefix shortening or spill budget (see presentStructuredDiagnostics).
 */
export function formatVerifyResultDiagnostics(result: VerifyResult): string {
  const opaque = renderOpaqueAndFailure(result);
  const body = renderDiagnosticBlocks(groupDiagnosticsForPresentation(result.diagnostics));
  const deferred =
    result.deferredCount !== undefined && result.deferredCount > 0
      ? `verify: deferred: ${String(result.deferredCount)}`
      : '';
  return [opaque, body, deferred].filter((part) => part.length > 0).join('\n');
}
