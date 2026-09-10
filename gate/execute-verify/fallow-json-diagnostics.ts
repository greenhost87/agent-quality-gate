import * as v from 'valibot';

import {
  checkResultFromDiagnostics,
  failedCheckResult,
  type CheckResult,
  type Diagnostic,
  type DiagnosticLocation,
} from './check-result.js';
import type { ToolRunResult } from './execute-verify.js';
import {
  CombinedSchema,
  DeadCodeSchema,
  FallowErrorSchema,
  FallowStdoutJsonSchema,
  HealthSchema,
  knownDeadCodeIssueCount,
  type CombinedOutput,
  type DeadCodeIssueArrays,
  type FallowStdoutJson,
  type HealthOutput,
} from './fallow-json-schemas.js';
import {
  codeDuplicationDiagnostics,
  locationFromPathLineCol,
  unusedListDiagnostics,
} from './fallow-hygiene-list-diagnostics.js';

function relatedFiles(files: readonly string[]): DiagnosticLocation[] {
  return files.slice(1).map((path) => ({ path, role: 'cycle-member' }));
}

function cyclesDiagnostics(output: DeadCodeIssueArrays): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const cycle of output.re_export_cycles) {
    const primary = cycle.files[0];
    if (primary === undefined) continue;
    diagnostics.push({
      source: 'fallow',
      ruleId: 're-export-cycle',
      severity: 'error',
      message: 'Re-export cycle; locations are in cycle order.',
      location: { path: primary },
      related: relatedFiles(cycle.files),
      groupHeader: 're-export-cycle',
    });
  }
  for (const cycle of output.circular_dependencies) {
    const files = cycle.files ?? cycle.cycle ?? [];
    const primary = files[0];
    if (primary === undefined) continue;
    diagnostics.push({
      source: 'fallow',
      ruleId: 'circular-deps',
      severity: 'error',
      message: 'Circular dependency; locations are in cycle order.',
      location: locationFromPathLineCol(primary, cycle.line, cycle.col),
      related: relatedFiles(files),
      groupHeader: 'circular-deps',
    });
  }
  for (const unresolved of output.unresolved_imports) {
    diagnostics.push({
      source: 'fallow',
      ruleId: 'unresolved-import',
      severity: 'error',
      message: unresolved.specifier,
      location: locationFromPathLineCol(unresolved.path, unresolved.line, unresolved.col),
      groupHeader: `unresolved-import:${unresolved.specifier}`,
    });
  }
  return diagnostics;
}

function boundaryDiagnostics(output: DeadCodeIssueArrays): Diagnostic[] {
  return output.boundary_violations.map((violation) => {
    const zones =
      violation.from_zone !== undefined && violation.to_zone !== undefined
        ? ` (${violation.from_zone} -> ${violation.to_zone})`
        : '';
    return {
      source: 'fallow',
      ruleId: 'boundary-violation',
      severity: 'error' as const,
      message: `Import crosses boundary${zones}`,
      location: locationFromPathLineCol(violation.from_path, violation.line, violation.col),
      related: [{ path: violation.to_path, role: 'import-target' }],
      groupHeader: 'boundary-violation',
    };
  });
}

function hygieneDiagnostics(output: CombinedOutput): Diagnostic[] {
  const check = output.check;
  if (check === undefined) {
    return codeDuplicationDiagnostics(output);
  }
  return [
    ...cyclesDiagnostics(check),
    ...boundaryDiagnostics(check),
    ...unusedListDiagnostics(check),
    ...codeDuplicationDiagnostics(output),
  ];
}

function complexityDiagnostics(output: HealthOutput): Diagnostic[] {
  return output.findings.map((finding) => ({
    source: 'fallow',
    ruleId: 'complexity',
    severity: 'error' as const,
    message: [
      finding.name,
      finding.cyclomatic === undefined ? undefined : `cyclomatic=${String(finding.cyclomatic)}`,
      finding.cognitive === undefined ? undefined : `cognitive=${String(finding.cognitive)}`,
    ]
      .filter((part): part is string => part !== undefined && part.length > 0)
      .join(':'),
    location: locationFromPathLineCol(finding.path, finding.line, finding.col),
    groupHeader: 'complexity',
  }));
}

function categoryFromArgs(
  analysisArgs: readonly string[],
): 'cycles' | 'boundaries' | 'hygiene' | 'complexity' {
  if (analysisArgs.includes('--boundary-violations')) {
    return 'boundaries';
  }
  if (
    analysisArgs.includes('--re-export-cycles') ||
    analysisArgs.includes('--circular-deps') ||
    analysisArgs.includes('--unresolved-imports')
  ) {
    return 'cycles';
  }
  if (analysisArgs.includes('--complexity')) {
    return 'complexity';
  }
  const skipIndex = analysisArgs.indexOf('--skip');
  if (skipIndex >= 0 && analysisArgs[skipIndex + 1] === 'health') {
    return 'hygiene';
  }
  return 'cycles';
}

function fallowToolFailure(raw: ToolRunResult, exitCode: number, message: string): CheckResult {
  return failedCheckResult(exitCode, message, {
    stdout: raw.stdout,
    stderr: raw.stderr,
  });
}

export function fallowProcessCrashResult(
  raw: ToolRunResult,
  fallbackMessage = 'fallow failed',
): CheckResult | undefined {
  if (raw.exitCode === 0 || raw.exitCode === 1) {
    return undefined;
  }
  return fallowToolFailure(raw, raw.exitCode, raw.stderr.trim() || fallbackMessage);
}

function checkResultFromComplexityJson(
  raw: ToolRunResult,
  parsedJson: FallowStdoutJson,
): CheckResult {
  const health = v.safeParse(HealthSchema, parsedJson);
  if (!health.success) {
    return fallowToolFailure(
      raw,
      raw.exitCode === 0 ? 1 : raw.exitCode,
      `fallow JSON did not match health schema: ${v.summarize(health.issues)}`,
    );
  }
  const diagnostics = complexityDiagnostics(health.output);
  return fallowFindingsOrProtocolFailure(raw, diagnostics);
}

function checkResultFromHygieneJson(raw: ToolRunResult, parsedJson: FallowStdoutJson): CheckResult {
  const combined = v.safeParse(CombinedSchema, parsedJson);
  if (combined.success) {
    const contentFailure = incompleteDeadCodeContentFailure(raw, combined.output.check);
    if (contentFailure !== undefined) {
      return contentFailure;
    }
    const diagnostics = hygieneDiagnostics(combined.output);
    return fallowFindingsOrProtocolFailure(raw, diagnostics);
  }
  const dead = v.safeParse(DeadCodeSchema, parsedJson);
  if (dead.success) {
    const contentFailure = incompleteDeadCodeContentFailure(raw, dead.output);
    if (contentFailure !== undefined) {
      return contentFailure;
    }
    const diagnostics = hygieneDiagnostics({ kind: 'combined', check: dead.output });
    return fallowFindingsOrProtocolFailure(raw, diagnostics);
  }
  return fallowToolFailure(
    raw,
    raw.exitCode === 0 ? 1 : raw.exitCode,
    `fallow JSON did not match hygiene schema: ${v.summarize(combined.issues)}`,
  );
}

function checkResultFromDeadCodeCategoryJson(
  raw: ToolRunResult,
  parsedJson: FallowStdoutJson,
  category: 'cycles' | 'boundaries',
): CheckResult {
  const dead = v.safeParse(DeadCodeSchema, parsedJson);
  if (!dead.success) {
    return fallowToolFailure(
      raw,
      raw.exitCode === 0 ? 1 : raw.exitCode,
      `fallow JSON did not match dead-code schema: ${v.summarize(dead.issues)}`,
    );
  }
  const contentFailure = incompleteDeadCodeContentFailure(raw, dead.output);
  if (contentFailure !== undefined) {
    return contentFailure;
  }
  const diagnostics =
    category === 'boundaries' ? boundaryDiagnostics(dead.output) : cyclesDiagnostics(dead.output);
  return fallowFindingsOrProtocolFailure(raw, diagnostics);
}

/**
 * `total_issues > 0` without any known finding arrays is incomplete protocol content.
 */
function incompleteDeadCodeContentFailure(
  raw: ToolRunResult,
  check: DeadCodeIssueArrays | undefined,
): CheckResult | undefined {
  if (check === undefined) {
    return undefined;
  }
  if ((check.total_issues ?? 0) <= 0) {
    return undefined;
  }
  if (knownDeadCodeIssueCount(check) > 0) {
    return undefined;
  }
  return fallowToolFailure(
    raw,
    raw.exitCode === 0 ? 1 : raw.exitCode,
    'fallow reported total_issues without recognizable findings',
  );
}

/**
 * Fallow exit 1 means issues were reported. An empty adapted finding set is a protocol failure,
 * not a clean pass (incomplete/unrecognized report content).
 */
function fallowFindingsOrProtocolFailure(
  raw: ToolRunResult,
  diagnostics: readonly Diagnostic[],
): CheckResult {
  if (diagnostics.length > 0) {
    return checkResultFromDiagnostics(diagnostics, { exitCode: 1 });
  }
  if (raw.exitCode === 1) {
    return fallowToolFailure(raw, 1, 'fallow reported failure without recognizable findings');
  }
  return checkResultFromDiagnostics([]);
}

function checkResultFromParsedFallowJson(
  raw: ToolRunResult,
  parsedJson: FallowStdoutJson,
  analysisArgs: readonly string[],
): CheckResult {
  const errorParsed = v.safeParse(FallowErrorSchema, parsedJson);
  if (errorParsed.success) {
    return fallowToolFailure(
      raw,
      raw.exitCode === 0 ? 2 : raw.exitCode,
      errorParsed.output.message ?? 'fallow reported an error',
    );
  }

  const crash = fallowProcessCrashResult(raw);
  if (crash !== undefined) {
    return crash;
  }

  const category = categoryFromArgs(analysisArgs);
  if (category === 'complexity') {
    return checkResultFromComplexityJson(raw, parsedJson);
  }
  if (category === 'hygiene') {
    return checkResultFromHygieneJson(raw, parsedJson);
  }
  return checkResultFromDeadCodeCategoryJson(raw, parsedJson, category);
}

/**
 * Adapt Fallow JSON process output into a subject CheckResult for the given analysis args.
 */
export function checkResultFromFallowJsonToolRun(
  raw: ToolRunResult,
  analysisArgs: readonly string[],
): CheckResult {
  const trimmed = raw.stdout.trim();

  if (trimmed.length === 0) {
    return fallowToolFailure(
      raw,
      raw.exitCode === 0 ? 1 : raw.exitCode,
      raw.stderr.trim() || 'fallow returned empty stdout; expected JSON diagnostics',
    );
  }

  const crash = fallowProcessCrashResult(raw);
  const root = v.safeParse(v.pipe(v.string(), v.parseJson(), FallowStdoutJsonSchema), trimmed);
  if (!root.success) {
    return (
      crash ??
      fallowToolFailure(
        raw,
        raw.exitCode === 0 ? 1 : raw.exitCode,
        'fallow returned non-JSON stdout',
      )
    );
  }
  return checkResultFromParsedFallowJson(raw, root.output, analysisArgs);
}

export function checkResultFromFallowCyclesToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromFallowJsonToolRun(raw, [
    'dead-code',
    '--re-export-cycles',
    '--circular-deps',
    '--unresolved-imports',
  ]);
}

export function checkResultFromFallowBoundariesToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromFallowJsonToolRun(raw, ['dead-code', '--boundary-violations']);
}

export function checkResultFromFallowHygieneToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromFallowJsonToolRun(raw, ['--skip', 'health']);
}

export function checkResultFromFallowComplexityToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromFallowJsonToolRun(raw, ['health', '--complexity']);
}
