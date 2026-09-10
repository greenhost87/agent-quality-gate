import { collectCheckHints, type CheckHint } from './check-hints.js';

/** Path and optional coordinates for a diagnostic location (including related roles). */
export type DiagnosticLocation = {
  path: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  offset?: number;
  length?: number;
  label?: string;
  /** Role when used as a related location (importer, cycle peer, related span). */
  role?: string;
};

export const DIAGNOSTIC_SEVERITIES = ['error', 'warning'] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

/**
 * Subject diagnostic kept structured until the presentation layer.
 * Coordinates are only those the tool supplied; never invented.
 */
export type Diagnostic = {
  /** Tool or preset owner (`oxlint`, `fallow`, `layout`, …). */
  source: string;
  /** Config-facing rule id when known (`aqg/no-class`, `no-debugger`, …). */
  ruleId?: string;
  severity: DiagnosticSeverity;
  message: string;
  location?: DiagnosticLocation;
  related?: readonly DiagnosticLocation[];
  help?: string;
  url?: string;
  /** Stable grouping header when message alone is not the group key. */
  groupHeader?: string;
  /** Shared location rendered in the group header, with normal path shortening. */
  groupLocation?: DiagnosticLocation;
};

/** Launch, timeout, config, or machine-protocol failure — not a source finding. */
export type ExecutionFailure = {
  message: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

/**
 * Subject result of one check or phase. Process stdout/stderr are not the finding contract.
 * Opaque text is only for real external boundaries without a structured protocol (M6).
 */
export type CheckResult = {
  /** Optional routing for a preset check; omitted checks keep the preset stage priority. */
  lintGroup?: 'boundaries' | 'contracts' | 'lint' | 'ui';
  exitCode: number;
  diagnostics: readonly Diagnostic[];
  hints?: readonly CheckHint[];
  failures?: readonly ExecutionFailure[];
  opaqueText?: string;
  /** Issues held back for later oxlint groups; preserved across merges. */
  deferredCount?: number;
};

export function emptyCheckResult(): CheckResult {
  return { exitCode: 0, diagnostics: [] };
}

export function checkHasFindings(result: CheckResult): boolean {
  return result.diagnostics.length > 0;
}

export function checkIsToolFailure(result: CheckResult): boolean {
  return (result.failures?.length ?? 0) > 0 || (result.exitCode !== 0 && !checkHasFindings(result));
}

export function failedCheckResult(
  exitCode: number,
  message: string,
  streams?: { stdout?: string; stderr?: string },
): CheckResult {
  return {
    exitCode,
    diagnostics: [],
    failures: [
      {
        message,
        exitCode,
        ...(streams?.stdout === undefined ? {} : { stdout: streams.stdout }),
        ...(streams?.stderr === undefined ? {} : { stderr: streams.stderr }),
      },
    ],
    ...(streams?.stderr === undefined ? {} : { opaqueText: streams.stderr }),
  };
}

export function opaqueCheckResult(exitCode: number, text: string): CheckResult {
  return {
    exitCode,
    diagnostics: [],
    opaqueText: text,
  };
}

export type CheckResultFromDiagnosticsOptions = {
  exitCode?: number;
  hints?: readonly CheckHint[];
  failures?: readonly ExecutionFailure[];
  opaqueText?: string;
  deferredCount?: number;
};

export function checkResultFromDiagnostics(
  diagnostics: readonly Diagnostic[],
  options: CheckResultFromDiagnosticsOptions = {},
): CheckResult {
  const exitCode =
    options.exitCode ??
    Math.max(
      diagnostics.length > 0 ? 1 : 0,
      ...(options.failures ?? []).map((failure) => failure.exitCode),
    );
  return {
    exitCode,
    diagnostics,
    ...(options.hints === undefined || options.hints.length === 0 ? {} : { hints: options.hints }),
    ...(options.failures === undefined ? {} : { failures: options.failures }),
    ...(options.opaqueText === undefined || options.opaqueText.length === 0
      ? {}
      : { opaqueText: options.opaqueText }),
    ...(options.deferredCount === undefined ? {} : { deferredCount: options.deferredCount }),
  };
}

export function mergeCheckResults(...results: readonly CheckResult[]): CheckResult {
  if (results.length === 0) {
    return emptyCheckResult();
  }
  const diagnostics = results.flatMap((result) => result.diagnostics);
  const hints = collectCheckHints(results);
  const failures = results.flatMap((result) => result.failures ?? []);
  const opaqueParts = results
    .map((result) => result.opaqueText)
    .filter((text): text is string => text !== undefined && text.length > 0);
  const deferredTotal = results.reduce((sum, result) => sum + (result.deferredCount ?? 0), 0);
  return {
    exitCode: Math.max(0, ...results.map((result) => result.exitCode)),
    diagnostics,
    ...(hints === undefined ? {} : { hints }),
    ...(failures.length === 0 ? {} : { failures }),
    ...(opaqueParts.length === 0 ? {} : { opaqueText: opaqueParts.join('\n') }),
    ...(deferredTotal > 0 ? { deferredCount: deferredTotal } : {}),
  };
}
