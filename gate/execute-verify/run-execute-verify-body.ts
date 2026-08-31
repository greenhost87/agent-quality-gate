import {
  removeEphemeralProjectConfigs,
  verifyFallowConfigPathForProject,
} from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import type { EphemeralProjectConfigPaths } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import {
  FALLOW_CONFIG_NAME,
  readFallowConfigFile,
} from '../../config/verify-config-files/verify-config-files.js';
import { invalidProjectRelativeEntries } from '../../config/entries/entries.js';

import { fallowCacheEnvironment } from '../preflight/fallow-analysis.js';
import { packagedFallowConfigPath } from '../../config/packaged-assets/packaged-assets.js';
import { runActivePresetToolChecks } from '../../preset-catalog/load-check/load-preset-check.js';
import { QualityGateInternalError } from '../quality-gate-run/quality-gate-internal-error.js';
import { joinStreams, mergeIgnorePatterns } from '../../process/run-command/stream-utils.js';
import { timedTool, withVerifyTiming } from './verify-timing.js';
import {
  applyIgnoredOxlintRules,
  fallowCliArgs,
  fallowExecutablePath,
  oxlintToolRun,
  removeFallowInformation,
  writeFallowConfigWithEntries,
} from './verify-tool-run.js';
import { selectFirstNonEmptyOxlintGroup } from './filter-oxlint-agent-output.js';

import { DEFAULT_OXLINT_RULE_PHASE } from '../../preset-catalog/oxlint-config/oxlint-rule-setting.js';
import { groupOrderOptions, runPresetPreflight } from './preset-preflight.js';
import type {
  ExecuteVerifyOutcome,
  OxlintPhaseContext,
  PhaseTimings,
  ToolRunner,
  VerifyRequest,
  VerifyResult,
} from './execute-verify.js';

export const TYPE_AWARE_OXLINT_TIMEOUT_MS = 120_000;

export const TYPE_AWARE_OXLINT_TIMEOUT_HINT =
  'hint:type-aware-timeout — .aqg/hints/type-aware-timeout.md';

const PACKAGED_FALLOW_CONFIG_PATH = packagedFallowConfigPath();

function caughtErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : error;
}

function throwInternalVerifyFailure(error: Error | string): never {
  throw new QualityGateInternalError(caughtErrorMessage(error), {
    cause: error instanceof Error ? error : undefined,
  });
}

export async function runExecuteVerify(
  request: VerifyRequest,
  run: ToolRunner,
  projectRoot: string,
): Promise<ExecuteVerifyOutcome> {
  const ephemeral: EphemeralProjectConfigPaths = { fallowConfigPaths: [] };
  try {
    return await runExecuteVerifyBody(request, run, projectRoot, ephemeral);
  } finally {
    await removeEphemeralProjectConfigs(projectRoot, ephemeral);
  }
}

async function runOxlintVirtualPhases(
  run: ToolRunner,
  projectRoot: string,
  context: OxlintPhaseContext,
): Promise<{ result?: VerifyResult; selectedGroupId?: string; ms: number }> {
  const oxlintTimeoutMs = context.typeAware ? TYPE_AWARE_OXLINT_TIMEOUT_MS : undefined;
  const oxlintTimed = await timedTool(async () => {
    const raw = await run({
      name: 'oxlint',
      args: context.args,
      environment: context.environment,
      cwd: projectRoot,
      timeoutMs: oxlintTimeoutMs,
      timeoutMessage: oxlintTimeoutMs === undefined ? undefined : TYPE_AWARE_OXLINT_TIMEOUT_HINT,
      failurePrefix: 'verify: failed to start ',
    });
    return applyIgnoredOxlintRules(raw, context.ignoreRuleIds);
  });
  if (oxlintTimed.result.exitCode === 0) {
    return { ms: oxlintTimed.ms };
  }

  const initialStdout = selectFirstNonEmptyOxlintGroup(
    oxlintTimed.result.stdout,
    context.lintGroups,
  );
  const initialStderr = selectFirstNonEmptyOxlintGroup(
    oxlintTimed.result.stderr,
    context.lintGroups,
  );
  if (!initialStdout.hasIssues && !initialStderr.hasIssues) {
    // Crash without issue lines: show everything unfiltered and do not defer it behind Fallow.
    return { result: { ...oxlintTimed.result }, ms: oxlintTimed.ms };
  }

  const selectedGroupIndex = Math.min(
    ...[initialStdout.groupIndex, initialStderr.groupIndex].filter(
      (index): index is number => index !== undefined,
    ),
  );
  const stdoutSelection = initialStdout.hasIssues
    ? selectFirstNonEmptyOxlintGroup(
        oxlintTimed.result.stdout,
        context.lintGroups,
        selectedGroupIndex,
      )
    : initialStdout;
  const stderrSelection = initialStderr.hasIssues
    ? selectFirstNonEmptyOxlintGroup(
        oxlintTimed.result.stderr,
        context.lintGroups,
        selectedGroupIndex,
      )
    : initialStderr;
  const deferredCount = stdoutSelection.deferredCount + stderrSelection.deferredCount;
  return {
    result: {
      exitCode: oxlintTimed.result.exitCode,
      stdout: stdoutSelection.text,
      stderr: joinStreams([
        stderrSelection.text,
        deferredCount > 0 ? `verify: deferred: ${String(deferredCount)}\n` : '',
      ]),
    },
    selectedGroupId: context.lintGroups[selectedGroupIndex]?.id ?? DEFAULT_OXLINT_RULE_PHASE,
    ms: oxlintTimed.ms,
  };
}

function oxlintFailurePrecedingFallow(
  result: VerifyResult | undefined,
  selectedGroupId: string | undefined,
): VerifyResult | undefined {
  return selectedGroupId === DEFAULT_OXLINT_RULE_PHASE ? undefined : result;
}

async function runExecuteVerifyBody(
  request: VerifyRequest,
  run: ToolRunner,
  projectRoot: string,
  ephemeral: EphemeralProjectConfigPaths,
): Promise<ExecuteVerifyOutcome> {
  const entriesError = invalidProjectRelativeEntries(request.entries);
  if (entriesError !== undefined) {
    return {
      result: {
        exitCode: 2,
        stdout: '',
        stderr: `verify: ${entriesError}\n`,
      },
    };
  }

  const preflight = await runPresetPreflight(
    projectRoot,
    request.presets ?? [],
    request.presetConfig ?? {},
    request.skipPresetProjectChecks === true,
    ephemeral,
    groupOrderOptions(request),
  );
  if ('exitCode' in preflight) {
    return { result: preflight };
  }

  const ignorePatterns = mergeIgnorePatterns(
    (await readFallowConfigFile(PACKAGED_FALLOW_CONFIG_PATH, FALLOW_CONFIG_NAME)).ignorePatterns ??
      [],
    request.ignorePatterns ?? [],
  );

  const oxlintInvocation = oxlintToolRun(preflight.oxlintConfigPath, ignorePatterns);
  const fallowEnvironment = fallowCacheEnvironment(projectRoot);
  const fallowExecutable = fallowExecutablePath();
  const fallowConfigPath = await writeFallowConfigWithEntries(
    PACKAGED_FALLOW_CONFIG_PATH,
    projectRoot,
    request.entries,
    ignorePatterns,
    request.fallowIgnoreDependencies ?? [],
    undefined,
    verifyFallowConfigPathForProject(projectRoot),
  );
  ephemeral.fallowConfigPaths.push(fallowConfigPath);
  const phasesStartedAt = performance.now();
  const runFallow = async (configPath: string, extraPrefix: readonly string[]) => {
    return await timedTool(async () => {
      return await run({
        name: 'fallow',
        args: fallowCliArgs(fallowExecutable, configPath, projectRoot, extraPrefix),
        environment: fallowEnvironment,
        cwd: projectRoot,
        failurePrefix: 'verify: failed to start ',
      });
    });
  };

  // Phase 1 - cycles (fail-fast): re-export cycles, circular deps, unresolved imports only.
  const cyclesRun = await runFallow(fallowConfigPath, [
    'dead-code',
    '--re-export-cycles',
    '--circular-deps',
    '--unresolved-imports',
  ]);
  const cyclesTimings: PhaseTimings = { cyclesMs: cyclesRun.ms };
  if (cyclesRun.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(
        {
          exitCode: cyclesRun.result.exitCode,
          stdout: removeFallowInformation(cyclesRun.result.stdout),
          stderr: cyclesRun.result.stderr,
        },
        cyclesTimings,
        phasesStartedAt,
      ),
      timings: cyclesTimings,
    };
  }

  // Phases 2+3 - oxlint, preset boundary checks, and Fallow boundaries in parallel.
  // Boundary findings from oxlint fail immediately; semantic-lint boundary findings are
  // held until the Fallow boundary check has passed.
  const presetBoundaryContext = {
    projectRoot,
    entries: request.entries,
    ignorePatterns,
    fallowConfigPath,
  };
  const [oxlintRun, boundariesRun, presetBoundariesTimed] = await Promise.all([
    runOxlintVirtualPhases(run, projectRoot, {
      args: oxlintInvocation.args,
      environment: oxlintInvocation.environment,
      typeAware: preflight.typeAware,
      ignoreRuleIds: new Set(request.ignoreOxlintRuleIds ?? []),
      lintGroups: preflight.lintGroups,
    }),
    runFallow(fallowConfigPath, ['dead-code', '--boundary-violations']),
    timedTool(async () => {
      try {
        const checks = await runActivePresetToolChecks(
          presetBoundaryContext,
          preflight.activated,
          request.presetConfig ?? {},
        );
        return {
          exitCode: Math.max(0, ...checks.map((check) => check.exitCode)),
          stdout: joinStreams(checks.map((check) => check.stdout)),
          stderr: joinStreams(checks.map((check) => check.stderr)),
        };
      } catch (error) {
        return throwInternalVerifyFailure(error instanceof Error ? error : String(error));
      }
    }),
  ]);
  const lintTimings: PhaseTimings = {
    ...cyclesTimings,
    lintMs: oxlintRun.ms,
    boundariesMs: boundariesRun.ms,
    presetsMs: presetBoundariesTimed.ms,
  };
  const immediateOxlintFailure = oxlintFailurePrecedingFallow(
    oxlintRun.result,
    oxlintRun.selectedGroupId,
  );
  if (immediateOxlintFailure !== undefined) {
    return {
      result: withVerifyTiming(immediateOxlintFailure, lintTimings, phasesStartedAt),
      timings: lintTimings,
    };
  }
  if (presetBoundariesTimed.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(presetBoundariesTimed.result, lintTimings, phasesStartedAt),
      timings: lintTimings,
    };
  }
  if (boundariesRun.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(
        {
          exitCode: boundariesRun.result.exitCode,
          stdout: removeFallowInformation(boundariesRun.result.stdout),
          stderr: boundariesRun.result.stderr,
        },
        lintTimings,
        phasesStartedAt,
      ),
      timings: lintTimings,
    };
  }
  if (oxlintRun.result !== undefined) {
    return {
      result: withVerifyTiming(oxlintRun.result, lintTimings, phasesStartedAt),
      timings: lintTimings,
    };
  }

  // Phases 4+5 - hygiene and complexity.
  const postBoundaryTimings: PhaseTimings = { ...lintTimings };
  const [hygieneRun, complexityRun] = await Promise.all([
    runFallow(fallowConfigPath, ['--skip', 'health']),
    runFallow(fallowConfigPath, ['health', '--complexity']),
  ]);
  postBoundaryTimings.hygieneMs = hygieneRun.ms;
  postBoundaryTimings.complexityMs = complexityRun.ms;
  if (hygieneRun.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(
        {
          exitCode: hygieneRun.result.exitCode,
          stdout: removeFallowInformation(hygieneRun.result.stdout),
          stderr: hygieneRun.result.stderr,
        },
        postBoundaryTimings,
        phasesStartedAt,
      ),
      timings: postBoundaryTimings,
    };
  }
  if (complexityRun.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(
        {
          exitCode: complexityRun.result.exitCode,
          stdout: removeFallowInformation(complexityRun.result.stdout),
          stderr: complexityRun.result.stderr,
        },
        postBoundaryTimings,
        phasesStartedAt,
      ),
      timings: postBoundaryTimings,
    };
  }

  return {
    result: withVerifyTiming(
      { exitCode: 0, stdout: '', stderr: '' },
      postBoundaryTimings,
      phasesStartedAt,
    ),
    timings: postBoundaryTimings,
  };
}
