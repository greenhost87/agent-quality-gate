import {
  checkHasFindings,
  emptyCheckResult,
  failedCheckResult,
  mergeCheckResults,
  type CheckResult,
} from './check-result.js';
import { runLintGroupChecks } from './run-lint-group-checks.js';
import { lintGroupOrder } from './oxlint/virtual-groups.js';
import {
  fallowCombinedCacheDirForProject,
  fallowConfigPathForProject,
  fallowDupesCacheDirForProject,
  verifyDupesFallowConfigPathForProject,
  verifyFallowConfigPathForProject,
} from '#system/config/project-artifacts.js';
import { removeEphemeralProjectConfigs } from './ephemeral-project-configs.js';
import type { EphemeralProjectConfigPaths } from './ephemeral-project-configs.js';
import {
  FALLOW_CONFIG_NAME,
  readFallowConfigFile,
} from '#system/config/verify-config-files/verify-config-files.js';
import { invalidProjectRelativeEntries } from '#system/config/entries/entries.js';

import { fallowToolRun } from './fallow/tool-run.js';
import {
  checkResultFromFallowCombinedBoundariesToolRun,
  checkResultFromFallowCombinedComplexityToolRun,
  checkResultFromFallowCombinedCyclesToolRun,
  checkResultFromFallowCombinedHygieneToolRun,
  combinedSectionFromToolRun,
} from './fallow/json-diagnostics.js';
import {
  checkResultFromFallowDupesToolRun,
  combinedUiSectionFromToolRun,
  uiAuditFromToolRun,
} from './fallow/split-diagnostics.js';
import {
  readStructuralSeverityRules,
  structuralCheckResultFromCombinedToolRun,
  structuralRulesAllOff,
} from './fallow/structural-findings.js';
import { packagedFallowConfigPath } from '#system/config/packaged-assets/packaged-assets.js';
import { runActivePresetToolChecks } from '#system/presets/load-preset-check.js';
import { isKnownPresetName } from '#system/presets/preset-catalog.js';
import { mergeIgnorePatterns } from '#system/process/run-command/stream-utils.js';
import { timedCheck, withVerifyTiming } from './verify-timing.js';
import {
  checkResultFromOxlintToolRun,
  oxlintToolRun,
  writeFallowConfigWithEntries,
} from './verify-tool-run.js';
import { selectFirstNonEmptyOxlintDiagnosticGroup } from './oxlint/diagnostics.js';
import { runRequestedAutoFixes } from './run-requested-auto-fixes.js';
import { throwInternalVerifyFailure } from '../quality-gate-run/quality-gate-internal-error.js';
import { settleStage } from './settle-stage.js';
import { selectSettledParallelVerifyOutcome } from './select-settled-parallel-verify.js';
import { checkTestProductionCopies } from './test-production-copies.js';

import {
  TYPE_AWARE_OXLINT_TIMEOUT_HINT,
  TYPE_AWARE_OXLINT_TIMEOUT_MS,
} from '#system/config/tuning/tuning.js';
import { DEFAULT_OXLINT_RULE_PHASE } from '#system/presets/write-oxlint-config.js';
import { collectPresetDiagnosticHints } from '#system/presets/load-preset-gate-config.js';
import type { ActivatedPreset } from '#system/presets/preset-contract.types.js';
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
  activated: readonly ActivatedPreset[],
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

  const hints = await collectPresetDiagnosticHints(activated, selection.diagnostics);
  return {
    result: {
      exitCode: oxlintTimed.result.exitCode,
      diagnostics: selection.diagnostics,
      ...(hints.length === 0 ? {} : { hints }),
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

/**
 * Run duplication search only when the check-half of hygiene is green.
 */
async function stackedSecondFallowRun(
  run: ToolRunner,
  projectRoot: string,
  dupesConfigPath: string,
  dupesCacheDir: string,
  hygieneGreen: boolean,
) {
  if (!hygieneGreen) {
    return undefined;
  }
  return timedCheck(async () =>
    run(
      fallowToolRun(
        projectRoot,
        dupesConfigPath,
        ['--fail-on-issues', '--only', 'dupes'],
        'json',
        dupesCacheDir,
      ),
    ),
  );
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
  const combinedCacheDir = fallowCombinedCacheDirForProject(projectRoot);
  const dupesCacheDir = fallowDupesCacheDirForProject(projectRoot);
  const uiConfig = {
    intrinsicInteractions: request.intrinsicInteractions,
    lifecycleCallbacks: request.lifecycleCallbacks,
    actionCompatibility: request.actionCompatibility,
  };
  const fixFailure = await runRequestedAutoFixes(
    request,
    run,
    projectRoot,
    ephemeral,
    preflight.oxlintConfigPath,
    preflight.typeAware,
    ignorePatterns,
    combinedCacheDir,
  );
  if (fixFailure !== undefined) return { result: fixFailure };
  const fallowConfigPath = await writeFallowConfigWithEntries(
    PACKAGED_FALLOW_CONFIG_PATH,
    projectRoot,
    request.entries,
    ignorePatterns,
    request.fallowIgnoreDependencies ?? [],
    undefined,
    verifyFallowConfigPathForProject(projectRoot),
    uiConfig,
    {},
    combinedCacheDir,
  );
  // Second launch config: test-copies scope (`production: false`, default
  // duplicate ignores off) stacked `dupes` extraction on the `dupes`
  // cache, separate from the `combined` cache of the first launch.
  const dupesConfigPath = await writeFallowConfigWithEntries(
    PACKAGED_FALLOW_CONFIG_PATH,
    projectRoot,
    request.entries,
    ignorePatterns,
    request.fallowIgnoreDependencies ?? [],
    undefined,
    verifyDupesFallowConfigPathForProject(projectRoot),
    uiConfig,
    {},
    dupesCacheDir,
    false,
    false,
  );
  const combinedConfigPath =
    Object.keys(preflight.contract.fallowRules).length === 0
      ? fallowConfigPath
      : await writeFallowConfigWithEntries(
          PACKAGED_FALLOW_CONFIG_PATH,
          projectRoot,
          request.entries,
          ignorePatterns,
          request.fallowIgnoreDependencies ?? [],
          undefined,
          fallowConfigPathForProject(projectRoot),
          uiConfig,
          preflight.contract.fallowRules,
          combinedCacheDir,
        );
  if (combinedConfigPath !== fallowConfigPath) {
    ephemeral.fallowConfigPaths.push(combinedConfigPath);
  }
  const phasesStartedAt = performance.now();
  // First launch: combined `check + health` only. Duplication search moved
  // to the second launch. Each phase
  // derives its exit code from its own section diagnostics.
  const combinedArgs = ['--fail-on-issues', '--skip', 'dupes'];
  const combinedRun = timedCheck(async () => {
    const tool = await run(
      fallowToolRun(projectRoot, combinedConfigPath, combinedArgs, 'json', combinedCacheDir),
    );
    return tool;
  });

  // Cycles gate (fail-fast): red cycles return before oxlint and presets
  // start, exactly as the former dedicated dead-code run did. The remaining
  // stages fan out below from the already-resolved shared run, so green
  // verifies still overlap oxlint with the in-process derivations.
  const { result: combinedTool, ms: combinedMs } = await combinedRun;
  const cyclesResult = checkResultFromFallowCombinedCyclesToolRun(combinedTool);
  const cyclesTimings: PhaseTimings = { cyclesMs: combinedMs };
  if (cyclesResult.exitCode !== 0) {
    return {
      result: withVerifyTiming(cyclesResult, cyclesTimings, phasesStartedAt),
      timings: cyclesTimings,
    };
  }
  const structuralCheck = async (): Promise<CheckResult> => {
    const rules = await readStructuralSeverityRules(fallowConfigPath);
    if (structuralRulesAllOff(rules)) {
      return emptyCheckResult();
    }
    const { result: tool } = await combinedRun;
    return structuralCheckResultFromCombinedToolRun(tool, rules);
  };
  const boundariesStage = settleStage(
    combinedRun.then(({ result: tool, ms }) => ({
      result: checkResultFromFallowCombinedBoundariesToolRun(tool),
      ms,
    })),
  );
  const complexityStage = settleStage(
    combinedRun.then(({ result: tool, ms }) => ({
      result: checkResultFromFallowCombinedComplexityToolRun(tool),
      ms,
    })),
  );
  const hygieneCheckHalf = checkResultFromFallowCombinedHygieneToolRun(
    combinedTool,
    preflight.contract.fallowCheckKeys,
  );
  const secondRun = stackedSecondFallowRun(
    run,
    projectRoot,
    dupesConfigPath,
    dupesCacheDir,
    hygieneCheckHalf.exitCode === 0,
  );
  const needsExternalPresetUi = preflight.activated.some(
    (preset) => !isKnownPresetName(preset.name),
  );
  const uiRun = needsExternalPresetUi
    ? timedCheck(async () =>
        run(fallowToolRun(projectRoot, dupesConfigPath, ['ui'], 'json', dupesCacheDir)),
      )
    : undefined;
  const hygieneStage = settleStage(
    (async () => {
      const secondTimed = await secondRun;
      if (hygieneCheckHalf.exitCode !== 0 || secondTimed === undefined) {
        return { result: hygieneCheckHalf, ms: combinedMs };
      }
      const withDupes = mergeCheckResults(
        hygieneCheckHalf,
        checkResultFromFallowDupesToolRun(secondTimed.result),
      );
      // Former third launch, now an in-process filter on the shared second
      // run: no spawn, same dupes scope as before. Gated on the check-half
      // (not the dupes-half): prod↔test copies are this filter's
      // jurisdiction even when the wide dupes section also flags them as
      // code-duplication.
      return {
        result: mergeCheckResults(
          withDupes,
          await checkTestProductionCopies(projectRoot, secondTimed.result),
        ),
        ms: combinedMs + secondTimed.ms,
      };
    })(),
  );

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
      const uiTool = (await uiRun)?.result;
      return await runActivePresetToolChecks(
        {
          ...presetBoundaryContext,
          fallowCheckSection: combinedSectionFromToolRun(combinedTool, 'check'),
          fallowUiCoverage: uiTool === undefined ? undefined : combinedUiSectionFromToolRun(uiTool),
          fallowUiAudit: uiTool === undefined ? undefined : uiAuditFromToolRun(uiTool),
        },
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
          runOxlintVirtualPhases(
            run,
            projectRoot,
            {
              args: oxlintInvocation.args,
              environment: oxlintInvocation.environment,
              typeAware: preflight.typeAware,
              ignoreRuleIds: new Set(request.ignoreOxlintRuleIds ?? []),
              lintGroups: preflight.lintGroups,
            },
            preflight.activated,
          ),
          structuralCheck,
          lintGroupOrder(request.lintGroups),
          presetChecks,
        ),
      ),
      boundariesStage,
      settleStage(
        presetChecks.then(({ result, ms }) => ({
          result: mergeCheckResults(...result.filter((check) => check.lintGroup === undefined)),
          ms,
        })),
      ),
      hygieneStage,
      complexityStage,
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
