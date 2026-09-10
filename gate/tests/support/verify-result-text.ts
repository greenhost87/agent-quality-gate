import type { CheckHint } from '../../execute-verify/check-hints.js';
import type { Diagnostic, ExecutionFailure } from '../../execute-verify/check-result.js';
import type { VerifyResult } from '../../execute-verify/execute-verify.js';
import { formatVerifyResultDiagnostics } from '../../quality-gate-run/format-diagnostics.js';
import { streamResultFromVerifyResult } from '../../public-verify/verify-streams.js';

/** Agent/CLI-facing text from a VerifyResult (diagnostics + status streams). */
export function verifyOutputText(result: VerifyResult): string {
  const streams = streamResultFromVerifyResult(result);
  return `${streams.stdout}${streams.stderr}`;
}

/** Alias used by execute-verify characterization tests. */
export function verifyPresentedText(result: VerifyResult): string {
  return verifyOutputText(result);
}

/** Subset of VerifyResult fields used when presenting a check without full status. */
export type PresentedCheckResult = {
  diagnostics: readonly Diagnostic[];
  opaqueText?: string;
  failures?: readonly ExecutionFailure[];
  deferredCount?: number;
  hints?: readonly CheckHint[];
  statusStdout?: string;
  statusStderr?: string;
};

/** Present a CheckResult (or VerifyResult) without requiring stream status fields. */
export function checkPresentedText(result: PresentedCheckResult): string {
  return verifyOutputText({
    exitCode: 1,
    diagnostics: result.diagnostics,
    ...(result.opaqueText === undefined ? {} : { opaqueText: result.opaqueText }),
    ...(result.failures === undefined ? {} : { failures: result.failures }),
    ...(result.deferredCount === undefined ? {} : { deferredCount: result.deferredCount }),
    ...(result.hints === undefined ? {} : { hints: result.hints }),
    ...(result.statusStdout === undefined ? {} : { statusStdout: result.statusStdout }),
    ...(result.statusStderr === undefined ? {} : { statusStderr: result.statusStderr }),
  });
}

export function verifyDiagnosticsText(result: VerifyResult): string {
  return formatVerifyResultDiagnostics(result);
}

/** Minimal oxlint JSON diagnostic for ToolRunner mocks. */
export type OxlintJsonStdoutDiagnostic = {
  message: string;
  code: string;
  severity?: 'error' | 'warning';
  filename?: string;
  line?: number;
  column?: number;
};

export function oxlintJsonStdout(diagnostics: readonly OxlintJsonStdoutDiagnostic[]): string {
  return JSON.stringify({
    diagnostics: diagnostics.map((diagnostic) => ({
      message: diagnostic.message,
      code: diagnostic.code,
      severity: diagnostic.severity ?? 'error',
      filename: diagnostic.filename ?? 'src/index.ts',
      labels: [
        {
          span: {
            line: diagnostic.line ?? 1,
            column: diagnostic.column ?? 1,
            offset: 0,
            length: 1,
          },
        },
      ],
    })),
  });
}

export function fallowDeadCodeJson(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: 'dead-code',
    unused_files: [],
    unused_exports: [],
    unused_types: [],
    unused_dependencies: [],
    unused_dev_dependencies: [],
    unused_optional_dependencies: [],
    unused_enum_members: [],
    unused_class_members: [],
    unresolved_imports: [],
    unlisted_dependencies: [],
    duplicate_exports: [],
    type_only_dependencies: [],
    circular_dependencies: [],
    ...fields,
  });
}

export function fallowHealthJson(
  findings: readonly {
    path: string;
    name?: string;
    line?: number;
    cyclomatic?: number;
    cognitive?: number;
  }[] = [],
): string {
  return JSON.stringify({
    kind: 'health',
    findings,
    summary: { functions_above_threshold: findings.length },
  });
}

export function fallowCombinedJson(
  check: Record<string, unknown> = {},
  dupes: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    kind: 'combined',
    check: {
      unused_files: [],
      unused_exports: [],
      unused_types: [],
      unused_dependencies: [],
      unused_dev_dependencies: [],
      unused_optional_dependencies: [],
      unused_enum_members: [],
      unused_class_members: [],
      unresolved_imports: [],
      unlisted_dependencies: [],
      duplicate_exports: [],
      type_only_dependencies: [],
      circular_dependencies: [],
      total_issues: 0,
      ...check,
    },
    dupes: {
      clone_groups: [],
      ...dupes,
    },
  });
}
