import * as v from 'valibot';

import {
  checkResultFromDiagnostics,
  failedCheckResult,
  type CheckResult,
  type Diagnostic,
  type DiagnosticLocation,
} from '../check-result.js';
import type { ToolRunResult } from '../execute-verify.js';
import {
  CombinedHealthSchema,
  CombinedSchema,
  DeadCodeSchema,
  FallowErrorSchema,
  FallowStdoutJsonSchema,
  HealthSchema,
  knownDeadCodeIssueCount,
  type CombinedHealthSection,
  type CombinedOutput,
  type CombinedUiSection,
  type DeadCodeIssueArrays,
  type FallowStdoutJson,
  type HealthOutput,
} from './json-schemas.js';
import {
  codeDuplicationDiagnostics,
  locationFromPathLineCol,
  unusedListDiagnostics,
  withDuplicationHint,
} from './hygiene-list-diagnostics.js';

function relatedFiles(files: readonly string[]): DiagnosticLocation[] {
  return files.slice(1).map((path) => ({ path, role: 'cycle-member' }));
}

export function cyclesDiagnostics(output: DeadCodeIssueArrays): Diagnostic[] {
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

export function boundaryDiagnostics(output: DeadCodeIssueArrays): Diagnostic[] {
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

export function hygieneDiagnostics(output: CombinedOutput): Diagnostic[] {
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

export function complexityDiagnostics(output: HealthOutput): Diagnostic[] {
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

type ParsedFallowStdout = { readonly output: FallowStdoutJson } | { readonly failure: CheckResult };

/**
 * Shared stdout prologue for per-phase and combined adapters: empty stdout,
 * non-JSON output, process crash, and Fallow error envelope are handled
 * identically so the two pipelines cannot drift apart.
 */
export function parseFallowStdout(raw: ToolRunResult): ParsedFallowStdout {
  const trimmed = raw.stdout.trim();
  if (trimmed.length === 0) {
    return {
      failure: fallowToolFailure(
        raw,
        raw.exitCode === 0 ? 1 : raw.exitCode,
        raw.stderr.trim() || 'fallow returned empty stdout; expected JSON diagnostics',
      ),
    };
  }
  const crash = fallowProcessCrashResult(raw);
  const root = v.safeParse(v.pipe(v.string(), v.parseJson(), FallowStdoutJsonSchema), trimmed);
  if (!root.success) {
    return {
      failure:
        crash ??
        fallowToolFailure(
          raw,
          raw.exitCode === 0 ? 1 : raw.exitCode,
          'fallow returned non-JSON stdout',
        ),
    };
  }
  const errorParsed = v.safeParse(FallowErrorSchema, root.output);
  if (errorParsed.success) {
    return {
      failure: fallowToolFailure(
        raw,
        raw.exitCode === 0 ? 2 : raw.exitCode,
        errorParsed.output.message ?? 'fallow reported an error',
      ),
    };
  }
  if (crash !== undefined) {
    return { failure: crash };
  }
  return { output: root.output };
}

/**
 * Protocol failure shared by per-phase and combined adapters: exit 0 becomes
 * 1, any other exit passes through unchanged.
 */
function protocolFailure(raw: ToolRunResult, message: string): CheckResult {
  return fallowToolFailure(raw, raw.exitCode === 0 ? 1 : raw.exitCode, message);
}

/**
 * Extract one named section of a shared top-level combined run for presets
 * (Stages D/V4). `undefined` when the run produced no usable section
 * (unparseable stdout, schema mismatch, or absent section): the consuming
 * preset fails closed on `undefined` instead of spawning its own analysis.
 * Sections travel opaquely — the preset validates its own with its schemas.
 */
/** Parsed `combined` envelope of a verify launch, or `undefined` when unusable. */
export function combinedOutputFromToolRun(raw: ToolRunResult): CombinedOutput | undefined {
  const parsed = parseFallowStdout(raw);
  if (!('output' in parsed)) {
    return undefined;
  }
  const combined = v.safeParse(CombinedSchema, parsed.output);
  return combined.success ? combined.output : undefined;
}
export function combinedSectionFromToolRun(
  raw: ToolRunResult,
  section: 'ui',
): CombinedUiSection | undefined;
export function combinedSectionFromToolRun(
  raw: ToolRunResult,
  section: 'check',
): DeadCodeIssueArrays | undefined;
export function combinedSectionFromToolRun(
  raw: ToolRunResult,
  section: 'ui' | 'check',
): CombinedUiSection | DeadCodeIssueArrays | undefined {
  return combinedOutputFromToolRun(raw)?.[section];
}

/** Per-phase exit rule: the process exit code is authoritative for its own diagnostics. */
export function checkResultFromOwnSectionDiagnostics(diags: readonly Diagnostic[]): CheckResult {
  return checkResultFromDiagnostics(diags, { exitCode: diags.length > 0 ? 1 : 0 });
}

function checkResultFromComplexityJson(
  raw: ToolRunResult,
  parsedJson: FallowStdoutJson,
): CheckResult {
  const health = v.safeParse(HealthSchema, parsedJson);
  if (!health.success) {
    return protocolFailure(
      raw,
      `fallow JSON did not match health schema: ${v.summarize(health.issues)}`,
    );
  }
  const diagnostics = complexityDiagnostics(health.output);
  return fallowFindingsOrProtocolFailure(raw, diagnostics);
}

function checkResultFromHygieneJson(raw: ToolRunResult, parsedJson: FallowStdoutJson): CheckResult {
  const combined = v.safeParse(CombinedSchema, parsedJson);
  if (combined.success) {
    return (
      incompleteDeadCodeContentFailure(raw, combined.output.check) ??
      fallowFindingsOrProtocolFailure(raw, hygieneDiagnostics(combined.output))
    );
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
    return protocolFailure(
      raw,
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

/** `total_issues > 0` without any known finding arrays is incomplete protocol content. */
function incompleteDeadCodeContentFailure(
  raw: ToolRunResult,
  check: DeadCodeIssueArrays | undefined,
  additionalIssueKeys: readonly string[] = [],
): CheckResult | undefined {
  if (check === undefined) {
    return undefined;
  }
  if ((check.total_issues ?? 0) <= 0) {
    return undefined;
  }
  if (knownDeadCodeIssueCount(check, additionalIssueKeys) > 0) {
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
  const parsed = parseFallowStdout(raw);
  if ('failure' in parsed) {
    return parsed.failure;
  }
  return checkResultFromParsedFallowJson(raw, parsed.output, analysisArgs);
}

export function combinedHealthDiagnostics(health: CombinedHealthSection): Diagnostic[] {
  return complexityDiagnostics({ kind: 'health', findings: health.findings });
}

/**
 * Fan-out adapters for one shared top-level combined run (Stage A / V3b).
 *
 * A combined process exit 1 only means *some* section reported issues (it can
 * come from `ui` alone), so each phase derives its exit code from its own
 * diagnostics (1 iff its own findings are non-empty, else 0). Process crashes
 * (exit 2+) and schema/content failures still fail the phase, checked against
 * the whole run output.
 */
export function checkResultFromCombinedOutput(
  raw: ToolRunResult,
  adapt: (combined: CombinedOutput) => CheckResult,
): CheckResult {
  const parsed = parseFallowStdout(raw);
  if ('failure' in parsed) {
    return parsed.failure;
  }
  const combined = v.safeParse(CombinedSchema, parsed.output);
  if (!combined.success) {
    return protocolFailure(
      raw,
      `fallow JSON did not match combined schema: ${v.summarize(combined.issues)}`,
    );
  }
  return adapt(combined.output);
}

function checkResultFromCombinedHealthSection(
  raw: ToolRunResult,
  combined: CombinedOutput,
): CheckResult {
  const health = v.safeParse(CombinedHealthSchema, combined.health);
  if (!health.success) {
    return protocolFailure(
      raw,
      `fallow JSON did not match combined health schema: ${v.summarize(health.issues)}`,
    );
  }
  return checkResultFromOwnSectionDiagnostics(combinedHealthDiagnostics(health.output));
}

export function checkResultFromFallowCombinedBoundariesToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromCombinedOutput(raw, (combined) =>
    checkResultFromOwnSectionDiagnostics(
      combined.check === undefined ? [] : boundaryDiagnostics(combined.check),
    ),
  );
}

export function checkResultFromFallowCombinedHygieneToolRun(
  raw: ToolRunResult,
  additionalIssueKeys: readonly string[] = [],
): CheckResult {
  return checkResultFromCombinedOutput(
    raw,
    (combined) =>
      incompleteDeadCodeContentFailure(raw, combined.check, additionalIssueKeys) ??
      withDuplicationHint(checkResultFromOwnSectionDiagnostics(hygieneDiagnostics(combined))),
  );
}

export function checkResultFromFallowCombinedComplexityToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromCombinedOutput(raw, (combined) =>
    checkResultFromCombinedHealthSection(raw, combined),
  );
}

export function checkResultFromFallowCombinedCyclesToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromCombinedOutput(
    raw,
    (combined) =>
      incompleteDeadCodeContentFailure(raw, combined.check) ??
      checkResultFromOwnSectionDiagnostics(
        combined.check === undefined ? [] : cyclesDiagnostics(combined.check),
      ),
  );
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
  return withDuplicationHint(checkResultFromFallowJsonToolRun(raw, ['--skip', 'health']));
}

export function checkResultFromFallowComplexityToolRun(raw: ToolRunResult): CheckResult {
  return checkResultFromFallowJsonToolRun(raw, ['health', '--complexity']);
}
