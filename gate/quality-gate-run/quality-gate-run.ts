import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { executeVerify } from '../execute-verify/execute-verify.js';
import type { VerifyResult } from '../execute-verify/execute-verify.types.js';
import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../config/global-config/global-config.js';
import { resolveLinkedCheckoutRoot } from '../../config/linked-checkout/linked-checkout.js';
import { writeTextFile } from '../../process/files/files.js';
import { scheduleVerifyRunStats } from '../run-stats/verify-run-stats.js';
import { PARSE_EXAMPLE_RELATIVE_PATH, PARSE_EXAMPLE_SOURCE } from './parse-example-hint.js';
import type {
  CompactHintFlags,
  FollowUpDecision,
  QualityGateRun,
  RegisterQualityGateOptions,
} from './quality-gate-run.types.js';

export const QUALITY_GATE_FOLLOW_UP_BUDGET = 3;

export const VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES = 50;

export const VERIFY_FAILURE_LOG_RELATIVE_PATH = '.aqg/aqg-verify-failure.log';

export const VERIFY_INTERNAL_FAILURE_LOG_RELATIVE_PATH = '.aqg/aqg-internal-failure.log';

export const VERIFY_UNAVAILABLE_AGENT_MESSAGE =
  'verify: unavailable (internal error logged). Do not search for quality-gate configs, packages, or tooling.';

export const VERIFY_FAILURE_REMEDIATION = [
  'Fix only the violations listed below (and any hint: lines), in the listed source files or package.json.',
  'Do not investigate why the gate complains; apply the fix implied by each violation and hint.',
  'Do not dig into prior verify fixes, agent transcripts, other chat sessions, or git history to recover old patches or "known patterns".',
  'Do not search for verify binaries, fallow/jscpd config, agent-quality-gate packages, or restore deleted quality-gate files.',
  'When those fixes are done, make another native or MCP tool call (tool use) to verify.',
  'Do not consider the task complete until that tool call / tool use passes.',
].join(' ');

const FOLLOW_UP_ESCALATION = 'Retry budget exhausted. Stop and report the blocker to the user.';

const COMPACT_OUTPUT_HINTS = [
  {
    pattern: /(?:^|\n)\s*live-ui-surface:/u,
    hint: 'hint:live-ui-surface - remove the dead UI option from its prop type, CVA branch, render branch, and associated classes; for an unused theme token remove its @theme mapping and unreferenced backing variables. Do not add artificial call sites.',
  },
  {
    pattern: /(?:^|\n)\s*database-committed-migration\b/u,
    hint: 'hint:database-committed-migration — edited migration files were restored; copy the change from .aqg/restored-migration.diff into a new migration.',
  },
] as const;

function prefixOutputHints(output: string): string[] {
  const hints: string[] = [];
  for (const entry of COMPACT_OUTPUT_HINTS) {
    if (entry.pattern.test(output)) {
      hints.push(entry.hint);
    }
  }
  return hints;
}

function lineContainsMarker(trimmed: string, markers: readonly string[]): boolean {
  return markers.some((marker) => trimmed.includes(marker));
}

const DATABASE_BOUNDARY_MARKERS = [
  'database/dao-boundaries',
  'database(dao-boundaries)',
  'database/test-database-boundaries',
  'database(test-database-boundaries)',
] as const;

const PLAYWRIGHT_E2E_MARKERS = [
  'playwright/e2e-runner',
  'playwright(e2e-runner)',
  'playwright/e2e-black-box',
  'playwright(e2e-black-box)',
  'playwright/config',
  'playwright(config)',
] as const;

const HANDMADE_JSON_MARKERS = [
  'bun-parse/no-handmade-json-types',
  'bun-parse(no-handmade-json-types)',
] as const;

export const HANDMADE_JSON_HINT =
  'hint:bun-parse-handmade-json — to fix this, look at .aqg/parse_example.ts';

function recordCompactHintFlags(trimmed: string, flags: CompactHintFlags): void {
  if (trimmed.startsWith('presentation-duplication:')) {
    flags.presentationDuplication = true;
    return;
  }
  if (trimmed.startsWith('code-duplication:') || trimmed.startsWith('Duplication (')) {
    flags.duplication = true;
  }
  if (
    lineContainsMarker(trimmed, DATABASE_BOUNDARY_MARKERS) ||
    trimmed.startsWith('database-concurrent-script:')
  ) {
    flags.databaseBoundary = true;
  }
  if (
    trimmed.startsWith('playwright-config:') ||
    lineContainsMarker(trimmed, PLAYWRIGHT_E2E_MARKERS)
  ) {
    flags.playwrightE2e = true;
  }
  if (lineContainsMarker(trimmed, HANDMADE_JSON_MARKERS)) {
    flags.handmadeJson = true;
  }
}

function collectCompactHints(output: string): string[] {
  const hints: string[] = [];
  const flags: CompactHintFlags = {
    duplication: false,
    presentationDuplication: false,
    databaseBoundary: false,
    playwrightE2e: false,
    handmadeJson: false,
  };
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    const devDepInProd = /^dev-dep-in-prod:(.+)$/u.exec(trimmed);
    if (devDepInProd?.[1] !== undefined) {
      const name = devDepInProd[1];
      hints.push(
        `hint:dev-dep-in-prod:${name} — move "${name}" from devDependencies to dependencies; production code imports it.`,
      );
      continue;
    }
    recordCompactHintFlags(trimmed, flags);
  }
  if (flags.presentationDuplication) {
    hints.push(
      'hint:presentation-duplication — reuse the existing shared primitive at each call site with explicit props (for example Button with variant, or Input with type and step). Add a new shared component only when a smaller interface hides real composition or behavior; do not create a presentation adapter that only renames or re-lists props of Button/Input. Do not change detector thresholds or copy the markup elsewhere.',
    );
  }
  hints.push(...prefixOutputHints(output));
  if (flags.duplication) {
    hints.push(
      'hint:code-duplication — deduplicate the listed file ranges (extract shared helpers). Do not change duplication thresholds or search for jscpd.',
    );
  }
  if (flags.databaseBoundary) {
    hints.push(
      'hint:database-boundary - use an already production-reachable module for Arrange and observation; do not create or expand a DAO solely for a test; when no production path exists, stop and report the missing path as a blocker.',
    );
  }
  if (flags.playwrightE2e) {
    hints.push(
      'hint:playwright-e2e — use Playwright Test (tests/e2e/*.pw.ts, page fixture, webServer and baseURL in playwright.config.ts). For Postgres, follow the Playwright webServer note in scripts/playwright-web-server.ts.',
    );
  }
  if (flags.handmadeJson) {
    hints.push(HANDMADE_JSON_HINT);
  }
  return hints;
}

async function writeParseExampleHint(projectRoot: string): Promise<void> {
  const path = join(projectRoot, PARSE_EXAMPLE_RELATIVE_PATH);
  mkdirSync(dirname(path), { recursive: true });
  await writeTextFile(path, PARSE_EXAMPLE_SOURCE);
}

function formatDiagnostics(result: VerifyResult): string {
  return [result.stdout.trimEnd(), result.stderr.trimEnd()]
    .filter((value) => value.length > 0)
    .join('\n\n');
}

function diagnosticLineCount(diagnostics: string): number {
  if (diagnostics.length === 0) {
    return 0;
  }
  return diagnostics.split('\n').length;
}

async function presentDiagnostics(projectRoot: string, diagnostics: string): Promise<string> {
  const lineCount = diagnosticLineCount(diagnostics);
  if (lineCount <= VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES) {
    return diagnostics;
  }

  const logPath = join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH);
  mkdirSync(dirname(logPath), { recursive: true });
  await writeTextFile(logPath, `${diagnostics}\n`);

  const head = diagnostics.split('\n').slice(0, VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES).join('\n');
  return [
    `Full diagnostics (${String(lineCount)} lines) written to ${logPath}.`,
    'Fix the violations shown below first; read that file for the remainder or make another native or MCP tool call (tool use) to verify.',
    head,
  ].join('\n\n');
}

function internalFailureMessage(error: Error | string): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return error;
}

export async function logQualityGateInternalFailure(
  error: Error | string,
  projectRoot: string | undefined,
): Promise<string> {
  const logPath =
    projectRoot === undefined
      ? join(agentQualityGateHome(), 'aqg-internal-failure.log')
      : join(projectRoot, VERIFY_INTERNAL_FAILURE_LOG_RELATIVE_PATH);
  mkdirSync(dirname(logPath), { recursive: true });
  const stamp = new Date().toISOString();
  await writeTextFile(logPath, `[${stamp}]\n${internalFailureMessage(error)}\n`);
  return logPath;
}

export async function executeQualityGateForCwd(
  cwd: string,
  options: RegisterQualityGateOptions = {},
): Promise<QualityGateRun> {
  let projectRoot: string | undefined;
  const startedAt = performance.now();
  try {
    const config = await readGlobalQualityGateConfig(options.configPath);
    const project = findProjectForCwd(cwd, config.projects);
    if (project === undefined) {
      const resolvedCwd = resolve(cwd);
      scheduleVerifyRunStats({
        t: Math.floor(Date.now() / 1000),
        r: -1,
        ms: Math.round(performance.now() - startedAt),
        path: resolvedCwd,
      });
      return {
        kind: 'skipped',
        message: 'No configured agent-quality-gate project for this workspace.',
      };
    }
    projectRoot = resolveLinkedCheckoutRoot(cwd, project.root);
    const result = await executeVerify({
      projectRoot,
      entries: project.entries,
      presets: project.presets,
      ignorePatterns: project.ignorePatterns,
      packageBoundaries: project.packageBoundaries,
      modulePlacement: project.modulePlacement,
      baseline: project.baseline,
    });
    return { kind: 'ran', projectRoot, result };
  } catch (error) {
    const logPath = await logQualityGateInternalFailure(
      error instanceof Error ? error : String(error),
      projectRoot,
    );
    return { kind: 'unavailable', logPath };
  }
}

export async function followUpForSettledResult(run: QualityGateRun): Promise<string | undefined> {
  if (run.kind !== 'ran' || run.result.exitCode === 0) {
    return undefined;
  }
  const diagnostics = formatDiagnostics(run.result);
  const hints = collectCompactHints(diagnostics);
  if (hints.includes(HANDMADE_JSON_HINT)) {
    await writeParseExampleHint(run.projectRoot);
  }
  return [
    `verify failed with exit code ${String(run.result.exitCode)}.`,
    VERIFY_FAILURE_REMEDIATION,
    hints.length > 0 ? hints.join('\n') : '',
    await presentDiagnostics(run.projectRoot, diagnostics),
  ]
    .filter((value) => value.length > 0)
    .join('\n\n');
}

export function decideFollowUp(
  message: string | undefined,
  attempt: number,
  budget: number = QUALITY_GATE_FOLLOW_UP_BUDGET,
): FollowUpDecision {
  if (message === undefined || attempt >= budget) {
    return { action: 'none' };
  }
  if (attempt === budget - 1) {
    return {
      action: 'escalate',
      message: `${message}\n\n${FOLLOW_UP_ESCALATION}`,
    };
  }
  return { action: 'continue', message };
}

export async function toolOutput(run: QualityGateRun): Promise<string> {
  if (run.kind === 'skipped') {
    return run.message;
  }
  if (run.kind === 'unavailable') {
    return VERIFY_UNAVAILABLE_AGENT_MESSAGE;
  }
  if (run.result.exitCode === 0) {
    return run.result.stdout.trimEnd() || 'verify: ok';
  }
  return (await followUpForSettledResult(run)) ?? formatDiagnostics(run.result);
}
