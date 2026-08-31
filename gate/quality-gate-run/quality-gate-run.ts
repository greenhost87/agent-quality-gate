import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { executeVerify } from '../execute-verify/execute-verify.js';
import type { VerifyResult } from '../execute-verify/execute-verify.js';
import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../config/global-config/global-config.js';
import { resolveLinkedCheckoutRoot } from '../../config/linked-checkout/linked-checkout.js';
import { writeTextFile } from '../../process/files/files.js';
import {
  scheduleVerifyRunStats,
  optionalWorkspaceRootSourceField,
} from '../run-stats/verify-run-stats.js';
import type { WorkspaceRootSource } from '../run-stats/workspace-root-source.js';
import {
  materializeHintDocs,
  parseHintDocId,
  shortDevDepInProdHint,
  shortHint,
  type HintDocId,
} from './hint-docs.js';

export const QUALITY_GATE_FOLLOW_UP_BUDGET = 3;

export const VERIFY_FAILURE_DIAGNOSTIC_HEAD_LINES = 50;

export const VERIFY_FAILURE_LOG_RELATIVE_PATH = '.aqg/aqg-verify-failure.log';

export const VERIFY_INTERNAL_FAILURE_LOG_RELATIVE_PATH = '.aqg/aqg-internal-failure.log';

export const VERIFY_UNAVAILABLE_AGENT_MESSAGE =
  'verify: unavailable (internal error logged). Do not search for quality-gate configs, packages, or tooling.';

export const VERIFY_FAILURE_REMEDIATION = [
  'Fix only the violations listed below (and any hint: lines), in the listed source files or package.json.',
  'Apply fixes directly; do not investigate the gate or search prior fixes, transcripts, chats, git history, or gate tooling/config/packages.',
  'Do not restore deleted quality-gate files.',
  'Then call native or MCP verify again. Do not finish until it passes.',
].join(' ');

const FOLLOW_UP_ESCALATION = 'Retry budget exhausted. Stop and report the blocker to the user.';

const COMPACT_OUTPUT_HINTS = [
  {
    pattern: /(?:^|\n)\s*live-ui-surface:/u,
    hints: [shortHint('live-ui-surface')],
  },
  {
    pattern: /(?:^|\n)\s*database-committed-migration\b/u,
    hints: [shortHint('database-committed-migration')],
  },
  {
    pattern: /(?:^|\n)\s*single-consumer:/u,
    hints: [shortHint('single-consumer'), shortHint('avoid-micro-splits')],
  },
] as const;

const AVOID_MICRO_SPLITS_MARKERS = [
  'aqg/no-thin-forwarders',
  'aqg(no-thin-forwarders)',
  'aqg/no-trivial-const-wrappers',
  'aqg(no-trivial-const-wrappers)',
  'aqg/no-identity-aliases',
  'aqg(no-identity-aliases)',
  'aqg/no-useless-exported-type-aliases',
  'aqg(no-useless-exported-type-aliases)',
  'aqg/no-runtime-in-types-files',
  'aqg(no-runtime-in-types-files)',
] as const;

function prefixOutputHints(output: string): string[] {
  const hints: string[] = [];
  for (const entry of COMPACT_OUTPUT_HINTS) {
    if (entry.pattern.test(output)) {
      hints.push(...entry.hints);
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

const BUN_PARSE_JSON_MARKERS = [
  'bun-parse/no-raw-json-parse',
  'bun-parse(no-raw-json-parse)',
  'bun-parse/no-typeof-object',
  'bun-parse(no-typeof-object)',
  'bun-parse/scripts-boundaries',
  'bun-parse(scripts-boundaries)',
] as const;

const LEGACY_PARSE_EXAMPLE_RELATIVE_PATH = '.aqg/parse_example.ts';

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
    flags.bunParseJson = true;
  }
  if (lineContainsMarker(trimmed, BUN_PARSE_JSON_MARKERS)) {
    flags.bunParseJson = true;
  }
  if (lineContainsMarker(trimmed, AVOID_MICRO_SPLITS_MARKERS)) {
    flags.avoidMicroSplits = true;
  }
}

function collectCompactHints(output: string): string[] {
  const hints: string[] = [];
  const flags: CompactHintFlags = {
    duplication: false,
    presentationDuplication: false,
    databaseBoundary: false,
    playwrightE2e: false,
    bunParseJson: false,
    avoidMicroSplits: false,
  };
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    const devDepInProd = /^dev-dep-in-prod:(.+)$/u.exec(trimmed);
    if (devDepInProd?.[1] !== undefined) {
      hints.push(shortDevDepInProdHint(devDepInProd[1]));
      continue;
    }
    recordCompactHintFlags(trimmed, flags);
  }
  if (flags.presentationDuplication) {
    hints.push(shortHint('presentation-duplication'));
  }
  hints.push(...prefixOutputHints(output));
  if (flags.duplication) {
    hints.push(shortHint('code-duplication'));
  }
  if (flags.databaseBoundary) {
    hints.push(shortHint('database-boundary'));
  }
  if (flags.playwrightE2e) {
    hints.push(shortHint('playwright-e2e'));
  }
  if (flags.bunParseJson) {
    hints.push(shortHint('bun-parse-json'));
  }
  if (flags.avoidMicroSplits) {
    hints.push(shortHint('avoid-micro-splits'));
  }
  return hints;
}

function hintDocIdsFromLines(lines: readonly string[]): HintDocId[] {
  const ids: HintDocId[] = [];
  for (const line of lines) {
    const id = parseHintDocId(line);
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

async function removeLegacyParseExample(projectRoot: string): Promise<void> {
  try {
    await unlink(join(projectRoot, LEGACY_PARSE_EXAMPLE_RELATIVE_PATH));
  } catch {
    // Legacy cleanup is best-effort; hint materialization must still succeed.
  }
}

async function materializeFollowUpArtifacts(
  projectRoot: string,
  hints: readonly string[],
  diagnostics: string,
): Promise<void> {
  if (
    diagnostics.split('\n').some((line) => lineContainsMarker(line.trim(), HANDMADE_JSON_MARKERS))
  ) {
    await removeLegacyParseExample(projectRoot);
  }
  await materializeHintDocs(projectRoot, [
    ...hintDocIdsFromLines(hints),
    ...hintDocIdsFromLines(diagnostics.split('\n')),
  ]);
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
        ...optionalWorkspaceRootSourceField(options.workspaceRootSource),
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
      presetConfig: project.presetConfig,
      workspaceRootSource: options.workspaceRootSource,
      ...(config.verify === undefined
        ? {}
        : {
            ...(config.verify.lintGroups === undefined
              ? {}
              : { lintGroups: config.verify.lintGroups }),
            ...(config.verify.boundaryPluginPriority === undefined
              ? {}
              : { boundaryPluginPriority: config.verify.boundaryPluginPriority }),
          }),
    });
    if (project.warnings.length === 0) {
      return { kind: 'ran', projectRoot, result };
    }
    const warningBlock = `${project.warnings.join('\n')}\n`;
    return {
      kind: 'ran',
      projectRoot,
      result: {
        ...result,
        stderr: `${warningBlock}${result.stderr}`,
      },
    };
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
  await materializeFollowUpArtifacts(run.projectRoot, hints, diagnostics);
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

export type QualityGateRun =
  | { kind: 'skipped'; message: string }
  | { kind: 'unavailable'; logPath: string }
  | { kind: 'ran'; projectRoot: string; result: VerifyResult };

export type FollowUpDecision =
  | { action: 'none' }
  | { action: 'continue' | 'escalate'; message: string };

export type RegisterQualityGateOptions = {
  configPath?: string;
  workspaceRootSource?: WorkspaceRootSource;
};

export type CompactHintFlags = {
  duplication: boolean;
  presentationDuplication: boolean;
  databaseBoundary: boolean;
  playwrightE2e: boolean;
  bunParseJson: boolean;
  avoidMicroSplits: boolean;
};
