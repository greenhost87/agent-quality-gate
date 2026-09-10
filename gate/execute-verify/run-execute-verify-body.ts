import {
  checkHasFindings,
  failedCheckResult,
  mergeCheckResults,
  type CheckResult,
} from './check-result.js';
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

import { fallowToolRun } from './fallow-tool-run.js';
import {
  checkResultFromFallowBoundariesToolRun,
  checkResultFromFallowComplexityToolRun,
  checkResultFromFallowCyclesToolRun,
  checkResultFromFallowHygieneToolRun,
} from './fallow-json-diagnostics.js';
import { packagedFallowConfigPath } from '../../config/packaged-assets/packaged-assets.js';
import { runActivePresetToolChecks } from '../../preset-catalog/load-check/load-preset-check.js';
import type { ActivatedPreset } from '../../preset-catalog/contract/preset-contract.types.js';
import { QualityGateInternalError } from '../quality-gate-run/quality-gate-internal-error.js';
import { mergeIgnorePatterns } from '../../process/run-command/stream-utils.js';
import { timedCheck, withVerifyTiming } from './verify-timing.js';
import {
  checkResultFromOxlintToolRun,
  oxlintToolRun,
  writeFallowConfigWithEntries,
} from './verify-tool-run.js';
import { selectFirstNonEmptyOxlintDiagnosticGroup } from './oxlint-diagnostics.js';
import { checkFallowStructuralFindings } from './fallow-structural-findings.js';

import {
  TYPE_AWARE_OXLINT_TIMEOUT_HINT,
  TYPE_AWARE_OXLINT_TIMEOUT_MS,
} from '../../config/tuning/tuning.js';
import { DEFAULT_OXLINT_RULE_PHASE } from '../../preset-catalog/oxlint-config/oxlint-rule-setting.js';
import { groupOrderOptions, runPresetPreflight } from './preset-preflight.js';
import type {
  ExecuteVerifyOutcome,
  OxlintOutputGroup,
  OxlintPhaseContext,
  PhaseTimings,
  ToolRunner,
  ToolRunResult,
  VerifyRequest,
  VerifyResult,
} from './execute-verify.js';

const PACKAGED_FALLOW_CONFIG_PATH = packagedFallowConfigPath();

type FallowCheckRunner = (
  analysisArgs: readonly string[],
  toCheckResult: (raw: ToolRunResult) => CheckResult,
) => Promise<{ result: CheckResult; ms: number }>;

type BoundaryParallelPhaseOptions = {
  run: ToolRunner;
  projectRoot: string;
  request: VerifyRequest;
  typeAware: boolean;
  activated: readonly ActivatedPreset[];
  lintGroups: readonly OxlintOutputGroup[];
  oxlintArgs: readonly string[];
  oxlintEnvironment: Record<string, string>;
  ignorePatterns: readonly string[];
  fallowConfigPath: string;
  runFallowCheck: FallowCheckRunner;
  cyclesTimings: PhaseTimings;
  phasesStartedAt: number;
};

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
  const oxlintTimed = await timedCheck(async () => {
    const raw = await run({
      name: 'oxlint',
      args: context.args,
      environment: context.environment,
      cwd: projectRoot,
      timeoutMs: oxlintTimeoutMs,
      timeoutMessage: oxlintTimeoutMs === undefined ? undefined : TYPE_AWARE_OXLINT_TIMEOUT_HINT,
      failurePrefix: 'verify: failed to start ',
    });
    return checkResultFromOxlintToolRun(raw, context.ignoreRuleIds);
  });
  if (oxlintTimed.result.exitCode === 0 && !checkHasFindings(oxlintTimed.result)) {
    return { ms: oxlintTimed.ms };
  }
  if ((oxlintTimed.result.failures?.length ?? 0) > 0 && !checkHasFindings(oxlintTimed.result)) {
    const message = (oxlintTimed.result.failures ?? [])
      .map((failure) => failure.message)
      .join('\n');
    return {
      result: {
        ...oxlintTimed.result,
        statusStderr: message.endsWith('\n') ? message : `${message}\n`,
      },
      ms: oxlintTimed.ms,
    };
  }

  const selection = selectFirstNonEmptyOxlintDiagnosticGroup(
    oxlintTimed.result.diagnostics,
    context.lintGroups,
  );
  if (!selection.hasIssues) {
    return {
      result: { ...oxlintTimed.result },
      ms: oxlintTimed.ms,
    };
  }

  return {
    result: {
      exitCode: oxlintTimed.result.exitCode,
      diagnostics: selection.diagnostics,
      ...(oxlintTimed.result.hints === undefined ? {} : { hints: oxlintTimed.result.hints }),
      ...(oxlintTimed.result.failures === undefined
        ? {}
        : { failures: oxlintTimed.result.failures }),
      ...(oxlintTimed.result.opaqueText === undefined
        ? {}
        : { opaqueText: oxlintTimed.result.opaqueText }),
      deferredCount: selection.deferredCount,
    },
    selectedGroupId: context.lintGroups[selection.groupIndex ?? 0]?.id ?? DEFAULT_OXLINT_RULE_PHASE,
    ms: oxlintTimed.ms,
  };
}

function oxlintFailurePrecedingFallow(
  result: VerifyResult | undefined,
  selectedGroupId: string | undefined,
): VerifyResult | undefined {
  return selectedGroupId === DEFAULT_OXLINT_RULE_PHASE ? undefined : result;
}

function firstFailedResult(
  ...results: readonly (VerifyResult | undefined)[]
): VerifyResult | undefined {
  return results.find((result) => result !== undefined && result.exitCode !== 0);
}

async function runBoundaryParallelPhase(
  options: BoundaryParallelPhaseOptions,
): Promise<
  ExecuteVerifyOutcome | { continue: true; lintTimings: PhaseTimings; structural: CheckResult }
> {
  const presetBoundaryContext = {
    projectRoot: options.projectRoot,
    entries: options.request.entries,
    ignorePatterns: options.ignorePatterns,
    fallowConfigPath: options.fallowConfigPath,
  };
  const [oxlintRun, boundariesRun, presetBoundariesTimed, structuralTimed] = await Promise.all([
    runOxlintVirtualPhases(options.run, options.projectRoot, {
      args: options.oxlintArgs,
      environment: options.oxlintEnvironment,
      typeAware: options.typeAware,
      ignoreRuleIds: new Set(options.request.ignoreOxlintRuleIds ?? []),
      lintGroups: options.lintGroups,
    }),
    options.runFallowCheck(
      ['dead-code', '--boundary-violations'],
      checkResultFromFallowBoundariesToolRun,
    ),
    timedCheck(async () => {
      try {
        const checks = await runActivePresetToolChecks(
          presetBoundaryContext,
          options.activated,
          options.request.presetConfig ?? {},
        );
        return mergeCheckResults(...checks);
      } catch (error) {
        return throwInternalVerifyFailure(error instanceof Error ? error : String(error));
      }
    }),
    timedCheck(async () =>
      checkFallowStructuralFindings(options.run, options.projectRoot, options.fallowConfigPath),
    ),
  ]);
  const lintTimings: PhaseTimings = {
    ...options.cyclesTimings,
    lintMs: oxlintRun.ms,
    boundariesMs: boundariesRun.ms,
    presetsMs: presetBoundariesTimed.ms + structuralTimed.ms,
  };
  const failure = firstFailedResult(
    oxlintFailurePrecedingFallow(oxlintRun.result, oxlintRun.selectedGroupId),
    presetBoundariesTimed.result.exitCode !== 0 ? presetBoundariesTimed.result : undefined,
    boundariesRun.result.exitCode !== 0 ? boundariesRun.result : undefined,
    structuralTimed.result.exitCode !== 0 ? structuralTimed.result : undefined,
    oxlintRun.result,
  );
  if (failure !== undefined) {
    return {
      result: withVerifyTiming(failure, lintTimings, options.phasesStartedAt),
      timings: lintTimings,
    };
  }
  return { continue: true, lintTimings, structural: structuralTimed.result };
}

async function runHygieneComplexityPhase(
  runFallowCheck: FallowCheckRunner,
  lintTimings: PhaseTimings,
  structural: CheckResult,
  phasesStartedAt: number,
): Promise<ExecuteVerifyOutcome> {
  const postBoundaryTimings: PhaseTimings = { ...lintTimings };
  const [hygieneRun, complexityRun] = await Promise.all([
    runFallowCheck(['--skip', 'health'], checkResultFromFallowHygieneToolRun),
    runFallowCheck(['health', '--complexity'], checkResultFromFallowComplexityToolRun),
  ]);
  postBoundaryTimings.hygieneMs = hygieneRun.ms;
  postBoundaryTimings.complexityMs = complexityRun.ms;
  const failure = firstFailedResult(
    hygieneRun.result.exitCode !== 0 ? hygieneRun.result : undefined,
    complexityRun.result.exitCode !== 0 ? complexityRun.result : undefined,
  );
  if (failure !== undefined) {
    return {
      result: withVerifyTiming(failure, postBoundaryTimings, phasesStartedAt),
      timings: postBoundaryTimings,
    };
  }
  return {
    result: withVerifyTiming(
      mergeCheckResults({ exitCode: 0, diagnostics: [] }, structural),
      postBoundaryTimings,
      phasesStartedAt,
    ),
    timings: postBoundaryTimings,
  };
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
      result: failedCheckResult(2, `verify: ${entriesError}`),
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
  const runFallowCheck = async (
    analysisArgs: readonly string[],
    toCheckResult: (raw: ToolRunResult) => CheckResult,
  ) => {
    return await timedCheck(async () => {
      const raw = await run(fallowToolRun(projectRoot, fallowConfigPath, analysisArgs, 'json'));
      return toCheckResult(raw);
    });
  };

  // Phase 1 - cycles (fail-fast): re-export cycles, circular deps, unresolved imports only.
  const cyclesRun = await runFallowCheck(
    ['dead-code', '--re-export-cycles', '--circular-deps', '--unresolved-imports'],
    checkResultFromFallowCyclesToolRun,
  );
  const cyclesTimings: PhaseTimings = { cyclesMs: cyclesRun.ms };
  if (cyclesRun.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(cyclesRun.result, cyclesTimings, phasesStartedAt),
      timings: cyclesTimings,
    };
  }

  // Phases 2+3 - oxlint, preset boundary checks, Fallow boundaries, and structural in parallel.
  const boundaryPhase = await runBoundaryParallelPhase({
    run,
    projectRoot,
    request,
    typeAware: preflight.typeAware,
    activated: preflight.activated,
    lintGroups: preflight.lintGroups,
    oxlintArgs: oxlintInvocation.args,
    oxlintEnvironment: oxlintInvocation.environment,
    ignorePatterns,
    fallowConfigPath,
    runFallowCheck,
    cyclesTimings,
    phasesStartedAt,
  });
  if (!('continue' in boundaryPhase)) {
    return boundaryPhase;
  }

  // Phases 4+5 - hygiene and complexity.
  return await runHygieneComplexityPhase(
    runFallowCheck,
    boundaryPhase.lintTimings,
    boundaryPhase.structural,
    phasesStartedAt,
  );
}
