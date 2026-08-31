import { resolve } from 'node:path';

import { runNodeProcess } from '../../process/run-node-tool/run-node-tool.js';
import {
  scheduleVerifyRunStats,
  optionalWorkspaceRootSourceField,
} from '../run-stats/verify-run-stats.js';
import type { WorkspaceRootSource } from '../run-stats/workspace-root-source.js';
import { formatVerifyOk } from './verify-ok-message.js';
import { runExecuteVerify } from './run-execute-verify-body.js';

function timingFieldsFromPhases(timings: PhaseTimings): {
  c: number;
  b?: number;
  l?: number;
  h?: number;
  x?: number;
  pr?: number;
} {
  return {
    c: timings.cyclesMs,
    ...(timings.boundariesMs === undefined ? {} : { b: timings.boundariesMs }),
    ...(timings.lintMs === undefined ? {} : { l: timings.lintMs }),
    ...(timings.hygieneMs === undefined ? {} : { h: timings.hygieneMs }),
    ...(timings.complexityMs === undefined ? {} : { x: timings.complexityMs }),
    ...(timings.presetsMs === undefined ? {} : { pr: timings.presetsMs }),
  };
}

export async function executeVerify(
  request: VerifyRequest,
  run: ToolRunner = runNodeProcess,
): Promise<VerifyResult> {
  const startedAt = performance.now();
  const projectRoot = resolve(request.projectRoot);
  try {
    const outcome = await runExecuteVerify(request, run, projectRoot);
    const durationMs = Math.round(performance.now() - startedAt);
    scheduleVerifyRunStats({
      t: Math.floor(Date.now() / 1000),
      r: outcome.result.exitCode === 0 ? 0 : 1,
      ms: durationMs,
      path: projectRoot,
      ...optionalWorkspaceRootSourceField(request.workspaceRootSource),
      ...(outcome.timings === undefined ? {} : timingFieldsFromPhases(outcome.timings)),
    });
    if (outcome.result.exitCode === 0) {
      return {
        ...outcome.result,
        stdout: formatVerifyOk(request.okLabel, durationMs),
      };
    }
    return outcome.result;
  } catch (error) {
    scheduleVerifyRunStats({
      t: Math.floor(Date.now() / 1000),
      r: 1,
      ms: Math.round(performance.now() - startedAt),
      path: projectRoot,
      ...optionalWorkspaceRootSourceField(request.workspaceRootSource),
    });
    throw error;
  }
}

export type ToolRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type NodeProcessRunOptions = {
  name: string;
  args: readonly string[];
  cwd?: string;
  environment?: Record<string, string>;
  failurePrefix: string;
  timeoutMs?: number;
  timeoutMessage?: string;
};

export type NodeProcessToFileOptions = {
  name: string;
  args: readonly string[];
  cwd: string;
  environment: Record<string, string>;
  outputPath: string;
  failurePrefix: string;
};

export type ToolRunner = (options: NodeProcessRunOptions) => Promise<ToolRunResult>;

export type VerifyRequest = {
  projectRoot: string;
  entries: readonly string[];
  presets?: readonly string[];
  ignorePatterns?: readonly string[];
  fallowIgnoreDependencies?: readonly string[];
  /** Raw per-preset sections from config.yaml `presetConfig.<presetName>`. */
  presetConfig?: Readonly<Record<string, object>>;
  /** Skip dependency, managed-file, and preset check-module work; only merge oxlint policy and run tools. */
  skipPresetProjectChecks?: boolean;
  /** Drop these oxlint rule ids from agent-format diagnostics before deciding pass/fail. */
  ignoreOxlintRuleIds?: readonly string[];
  /** Ordered oxlint output group ids; first non-empty group gates the run (`lint` is appended if missing). */
  lintGroups?: readonly string[];
  /** Plugin order inside the `boundaries` group expansion; unknown plugins sort after, alphabetically. */
  boundaryPluginPriority?: readonly string[];
  /** Label after `verify: ok` on success (duration is appended by executeVerify). */
  okLabel?: string;
  workspaceRootSource?: WorkspaceRootSource;
};

export type VerifyResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type PhaseTimings = {
  cyclesMs: number;
  boundariesMs?: number;
  lintMs?: number;
  hygieneMs?: number;
  complexityMs?: number;
  presetsMs?: number;
};

export type ExecuteVerifyOutcome = {
  result: VerifyResult;
  timings?: PhaseTimings;
};

export type TimedToolRun = {
  result: ToolRunResult;
  ms: number;
};

/** Ordered group of oxlint rule ids used to virtually split one oxlint run into verify phases. */
export type OxlintOutputGroup = {
  id: string;
  ruleIds: ReadonlySet<string>;
};

/** Result of selecting the first non-empty oxlint output group for the agent. */
export type OxlintGroupSelection = {
  text: string;
  deferredCount: number;
  hasIssues: boolean;
  groupIndex?: number;
};

/** Everything the oxlint virtual phases need to run and split one oxlint invocation. */
export type OxlintPhaseContext = {
  args: readonly string[];
  environment: Record<string, string>;
  typeAware: boolean;
  ignoreRuleIds: ReadonlySet<string>;
  lintGroups: readonly OxlintOutputGroup[];
};

/** Config.yaml-driven ordering for oxlint virtual groups (`lintGroups`, `boundaryPluginPriority`). */
export type OxlintGroupOrderOptions = {
  /** Ordered group ids; first non-empty group gates the run; `lint` is appended when missing. */
  groupOrder?: readonly string[];
  /** Plugin order inside the `boundaries` expansion; unknown plugins sort after, alphabetically. */
  boundaryPluginPriority?: readonly string[];
};
