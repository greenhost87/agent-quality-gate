import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { agentQualityGateHome } from '#system/config/agent-quality-gate-home.js';
import { projectArtifactRunId } from '#system/config/project-artifacts.js';
import { QUALITY_GATE_FOLLOW_UP_BUDGET } from '#system/config/tuning/tuning.js';
import { executeVerify } from '../run/execute-verify.js';
import type { VerifyResult } from '../run/execute-verify.js';
import type { Diagnostic } from '../run/check-result.js';
import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
  type GlobalProject,
  type GlobalQualityGateConfig,
} from '#system/config/global-config/global-config.js';
import { resolveLinkedCheckoutRoot } from '#system/config/linked-checkout/linked-checkout.js';
import { pathExists, readTextFile, writeTextFile } from '#system/process/files/files.js';
import { getOptionalEnv } from '../read-env/read-env.js';
import {
  scheduleVerifyRunStats,
  optionalWorkspaceRootSourceField,
} from '../run-stats/verify-run-stats.js';
import type { WorkspaceRootSource } from '../run-stats/workspace-root-source.js';
import {
  collectSystemHints,
  dedupeShortHintLines,
  formatStructuredHints,
  materializeFollowUpArtifacts,
} from './follow-up-hints.js';
import { formatVerifyResultDiagnostics } from './format-diagnostics.js';
import {
  presentStructuredDiagnostics,
  VERIFY_FAILURE_MAX_LINES,
} from './present-verify-failure.js';

export const VERIFY_FAILURE_LOG_RELATIVE_PATH = '.aqg/aqg-verify-failure.log';

export const VERIFY_INTERNAL_FAILURE_LOG_RELATIVE_PATH = '.aqg/aqg-internal-failure.log';

export const VERIFY_UNAVAILABLE_AGENT_MESSAGE =
  'verify: unavailable (internal error logged). Do not search for quality-gate configs, packages, or tooling.';

export const VERIFY_FAILURE_REMEDIATION = [
  'Fix only the violations listed below (and any hint: lines), in the files they identify.',
  'Apply fixes directly; do not investigate the gate or search prior fixes, transcripts, chats, git history, or gate tooling/config/packages.',
  'Do not restore deleted quality-gate files.',
  'Then call native or MCP verify again. Do not finish until it passes.',
].join(' ');

const FOLLOW_UP_ESCALATION = 'Retry budget exhausted. Stop and report the blocker to the user.';

const AGENT_RUN_LOG_DIR_NAME = 'agent-run-logs';
const AGENT_RUN_LOG_DIR_ENV = 'AQG_AGENT_RUN_LOG_DIR';

function failureSpillMarker(): string {
  return `other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`;
}

async function appendFailureSpill(projectRoot: string, body: string): Promise<void> {
  const logPath = join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH);
  mkdirSync(dirname(logPath), { recursive: true });
  const existing = (await pathExists(logPath)) ? (await readTextFile(logPath)).trimEnd() : '';
  const sections = [existing, '--- additional model output ---', body]
    .filter((section) => section.length > 0)
    .join('\n');
  await writeTextFile(logPath, `${sections}\n`);
}

async function limitFailureMessage(projectRoot: string, message: string): Promise<string> {
  const lines = message.split('\n');
  if (lines.length <= VERIFY_FAILURE_MAX_LINES) {
    return message;
  }
  await appendFailureSpill(projectRoot, lines.slice(VERIFY_FAILURE_MAX_LINES - 1).join('\n'));
  return [...lines.slice(0, VERIFY_FAILURE_MAX_LINES - 1), failureSpillMarker()].join('\n');
}

function resolveAgentRunLogDirName(): string | undefined {
  const override = getOptionalEnv(AGENT_RUN_LOG_DIR_ENV);
  if (override !== undefined) {
    return override;
  }
  const underTest =
    process.argv.includes('test') || process.argv.some((entry) => entry.endsWith('.test.ts'));
  return underTest ? undefined : AGENT_RUN_LOG_DIR_NAME;
}

async function logAgentFacingVerifyText(
  source: 'toolOutput' | 'followUp',
  run: QualityGateRun,
  text: string,
  fullText?: string,
): Promise<void> {
  if (run.agentRunLogs === false) {
    return;
  }
  try {
    const dirName = resolveAgentRunLogDirName();
    if (dirName === undefined) {
      return;
    }
    const dir = join(agentQualityGateHome(), dirName);
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-');
    const path = join(dir, `${stamp}-${projectArtifactRunId()}.txt`);
    const meta = [
      `source=${source}`,
      `kind=${run.kind}`,
      run.kind === 'ran' ? `projectRoot=${run.projectRoot}` : undefined,
      run.kind === 'ran' ? `exitCode=${String(run.result.exitCode)}` : undefined,
      run.kind === 'unavailable' ? `internalLogPath=${run.logPath}` : undefined,
      `loggedAt=${new Date().toISOString()}`,
      '---',
      text,
      fullText === undefined || fullText === text
        ? undefined
        : `--- full (${String(fullText.length)} characters, grouped) ---\n${fullText}`,
      '',
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
    await writeTextFile(path, meta);
  } catch {
    // Study logging must never fail verify.
  }
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

async function executeTypeScriptProject(
  project: GlobalProject,
  projectRoot: string,
  config: GlobalQualityGateConfig,
  options: RegisterQualityGateOptions,
): Promise<VerifyResult> {
  return executeVerify({
    projectRoot,
    entries: project.entries,
    presets: project.presets,
    ignorePatterns: project.ignorePatterns,
    autoFix: project.autoFix,
    intrinsicInteractions: project.intrinsicInteractions,
    lifecycleCallbacks: project.lifecycleCallbacks,
    actionCompatibility: project.actionCompatibility,
    presetConfig: project.presetConfig,
    workspaceRootSource: options.workspaceRootSource,
    ...(config.verify?.lintGroups === undefined ? {} : { lintGroups: config.verify.lintGroups }),
    ...(config.verify?.boundaryPluginPriority === undefined
      ? {}
      : { boundaryPluginPriority: config.verify.boundaryPluginPriority }),
  });
}

export async function executeQualityGateForCwd(
  cwd: string,
  options: RegisterQualityGateOptions = {},
  loadedConfig?: GlobalQualityGateConfig,
): Promise<QualityGateRun> {
  let projectRoot: string | undefined;
  let agentRunLogs = true;
  const startedAt = performance.now();
  try {
    const config = loadedConfig ?? (await readGlobalQualityGateConfig(options.configPath));
    agentRunLogs = config.verify?.agentRunLogs ?? true;
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
        agentRunLogs,
      };
    }
    projectRoot = resolveLinkedCheckoutRoot(cwd, project.root);
    const result = await executeTypeScriptProject(project, projectRoot, config, options);
    if (project.warnings.length === 0) {
      return { kind: 'ran', projectRoot, result, agentRunLogs };
    }
    const warningBlock = `${project.warnings.join('\n')}\n`;
    return {
      kind: 'ran',
      projectRoot,
      result: {
        ...result,
        statusStderr: `${warningBlock}${result.statusStderr ?? ''}`,
      },
      agentRunLogs,
    };
  } catch (error) {
    const logPath = await logQualityGateInternalFailure(
      error instanceof Error ? error : String(error),
      projectRoot,
    );
    return { kind: 'unavailable', logPath, agentRunLogs };
  }
}

function hasHandmadeJson(diagnostics: readonly Diagnostic[] | undefined): boolean {
  return (diagnostics ?? []).some(
    (diagnostic) =>
      diagnostic.ruleId === 'bun-parse/no-handmade-json-types' ||
      diagnostic.ruleId === 'no-handmade-json-types',
  );
}

export async function followUpForSettledResult(run: QualityGateRun): Promise<string | undefined> {
  if (run.kind !== 'ran' || run.result.exitCode === 0) {
    return undefined;
  }
  const diagnostics = run.result.diagnostics;
  const ruleHints = collectSystemHints(diagnostics);
  const structured =
    run.result.hints === undefined || run.result.hints.length === 0
      ? undefined
      : formatStructuredHints(run.result.hints);
  const hints = dedupeShortHintLines([...(structured?.shortLines ?? []), ...ruleHints]);
  await materializeFollowUpArtifacts(
    run.projectRoot,
    hints,
    structured,
    hasHandmadeJson(diagnostics),
  );
  const presented = await presentStructuredDiagnostics(run.projectRoot, {
    ...run.result,
    diagnostics,
  });
  const deferred =
    run.result.deferredCount !== undefined && run.result.deferredCount > 0
      ? `verify: deferred: ${String(run.result.deferredCount)}`
      : '';
  // Avoid duplicating deferred if already in presented opaque/status path.
  const withDeferred = (text: string): string =>
    text.includes('verify: deferred:')
      ? text
      : [text, deferred].filter((part) => part.length > 0).join('\n');
  const body = withDeferred(presented.text);
  const fullMessage = [VERIFY_FAILURE_REMEDIATION, hints.length > 0 ? hints.join('\n') : '', body]
    .filter((value) => value.length > 0)
    .join('\n');
  const message = await limitFailureMessage(run.projectRoot, fullMessage);
  // The agent run log must keep the full diagnostics: presented.text is
  // trimmed to the line budget with the remainder spilled to the log file.
  const logBody = withDeferred(presented.full ?? presented.text);
  const logFullMessage = [
    VERIFY_FAILURE_REMEDIATION,
    hints.length > 0 ? hints.join('\n') : '',
    logBody,
  ]
    .filter((value) => value.length > 0)
    .join('\n');
  await logAgentFacingVerifyText('followUp', run, message, logFullMessage);
  return message;
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
      message: `${message}\n${FOLLOW_UP_ESCALATION}`,
    };
  }
  return { action: 'continue', message };
}

export async function toolOutput(run: QualityGateRun): Promise<string> {
  let text: string;
  if (run.kind === 'skipped') {
    text = run.message;
  } else if (run.kind === 'unavailable') {
    text = VERIFY_UNAVAILABLE_AGENT_MESSAGE;
  } else if (run.result.exitCode === 0) {
    const warnings = formatVerifyResultDiagnostics({
      ...run.result,
      deferredCount: undefined,
    });
    const ok = (run.result.statusStdout ?? '').trimEnd() || 'verify: ok';
    text = [warnings, ok].filter((part) => part.length > 0).join('\n');
  } else {
    return (await followUpForSettledResult(run)) ?? formatVerifyResultDiagnostics(run.result);
  }
  await logAgentFacingVerifyText('toolOutput', run, text);
  return text;
}

export type QualityGateRun =
  | { kind: 'skipped'; message: string; agentRunLogs?: boolean }
  | { kind: 'unavailable'; logPath: string; agentRunLogs?: boolean }
  | { kind: 'ran'; projectRoot: string; result: VerifyResult; agentRunLogs?: boolean };

export type FollowUpDecision =
  | { action: 'none' }
  | { action: 'continue' | 'escalate'; message: string };

export type RegisterQualityGateOptions = {
  configPath?: string;
  workspaceRootSource?: WorkspaceRootSource;
};
