import {
  checkHasFindings,
  failedCheckResult,
  mergeCheckResults,
  type CheckResult,
} from './check-result.js';
import { runLintGroupChecks } from './run-lint-group-checks.js';
import { lintGroupOrder } from './oxlint-virtual-groups.js';
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
import { mergeIgnorePatterns } from '../../process/run-command/stream-utils.js';
import { timedCheck, withVerifyTiming } from './verify-timing.js';
import {
  checkResultFromOxlintToolRun,
  oxlintToolRun,
  writeFallowConfigWithEntries,
} from './verify-tool-run.js';
import { selectFirstNonEmptyOxlintDiagnosticGroup } from './oxlint-diagnostics.js';
import { throwInternalVerifyFailure } from '../quality-gate-run/quality-gate-internal-error.js';
import { settleStage } from './settle-stage.js';
import { selectSettledParallelVerifyOutcome } from './select-settled-parallel-verify.js';

import {
  TYPE_AWARE_OXLINT_TIMEOUT_HINT,
  TYPE_AWARE_OXLINT_TIMEOUT_MS,
} from '../../config/tuning/tuning.js';
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

const PACKAGED_FALLOW_CONFIG_PATH = packagedFallowConfigPath();

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
  const phasesStartedAt = performance.now();
  const runFallowJson = async (
    configPath: string,
    extraPrefix: readonly string[],
    adapt: (tool: Awaited<ReturnType<ToolRunner>>) => CheckResult,
  ) => {
    return await timedCheck(async () => {
      const tool = await run(
        fallowToolRun(projectRoot, configPath, [...extraPrefix, '--fail-on-issues'], 'json'),
      );
      return adapt(tool);
    });
  };

  // Phase 1 - cycles (fail-fast): re-export cycles, circular deps, unresolved imports only.
  const cyclesRun = await runFallowJson(
    fallowConfigPath,
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

  // O1: overlap hygiene/complexity with oxlint group. Settle wrappers keep every
  // launched stage finished before return/cleanup; rejections never become unhandled.
  const presetBoundaryContext = {
    projectRoot,
    entries: request.entries,
    ignorePatterns,
    fallowConfigPath,
    managedFilePaths: preflight.managedFilePaths,
  };
  const presetChecks = timedCheck(async () => {
    try {
      return await runActivePresetToolChecks(
        presetBoundaryContext,
        preflight.activated,
        request.presetConfig ?? {},
      );
    } catch (error) {
      return throwInternalVerifyFailure(error instanceof Error ? error : String(error));
    }
  });
  const [oxlintSettled, boundariesSettled, presetsSettled, hygieneSettled, complexitySettled] =
    await Promise.all([
      settleStage(
        runLintGroupChecks(
          runOxlintVirtualPhases(run, projectRoot, {
            args: oxlintInvocation.args,
            environment: oxlintInvocation.environment,
            typeAware: preflight.typeAware,
            ignoreRuleIds: new Set(request.ignoreOxlintRuleIds ?? []),
            lintGroups: preflight.lintGroups,
          }),
          run,
          projectRoot,
          fallowConfigPath,
          lintGroupOrder(request.lintGroups),
          presetChecks,
        ),
      ),
      settleStage(
        runFallowJson(
          fallowConfigPath,
          ['dead-code', '--boundary-violations'],
          checkResultFromFallowBoundariesToolRun,
        ),
      ),
      settleStage(
        presetChecks.then(({ result, ms }) => ({
          result: mergeCheckResults(...result.filter((check) => check.lintGroup === undefined)),
          ms,
        })),
      ),
      settleStage(
        runFallowJson(
          fallowConfigPath,
          ['--skip', 'health'],
          checkResultFromFallowHygieneToolRun,
        ),
      ),
      settleStage(
        runFallowJson(
          fallowConfigPath,
          ['health', '--complexity'],
          checkResultFromFallowComplexityToolRun,
        ),
      ),
    ]);

  const lintTimings: PhaseTimings = {
    ...cyclesTimings,
    lintMs: oxlintSettled.ms,
    boundariesMs: boundariesSettled.ms,
    presetsMs: presetsSettled.ms,
    hygieneMs: hygieneSettled.ms,
    complexityMs: complexitySettled.ms,
  };

  return selectSettledParallelVerifyOutcome({
    oxlintSettled,
    boundariesSettled,
    presetsSettled,
    hygieneSettled,
    complexitySettled,
    lintTimings,
    phasesStartedAt,
    defaultOxlintPhase: DEFAULT_OXLINT_RULE_PHASE,
  });
}
