import { resolve } from 'node:path';

import { removeEphemeralProjectConfigs } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import type { EphemeralProjectConfigPaths } from '../../config/agent-quality-gate-home/agent-quality-gate-home.types.js';
import {
  FALLOW_CONFIG_NAME,
  readFallowConfigFile,
  readOxlintConfig,
} from '../../config/verify-config-files/verify-config-files.js';
import { invalidProjectRelativeEntries } from '../../config/entries/entries.js';
import type {
  ExecuteVerifyOutcome,
  PhaseTimings,
  TimedToolRun,
  ToolRunner,
  VerifyRequest,
  VerifyResult,
} from './execute-verify.types.js';
import { fallowCacheEnvironment } from '../preflight/fallow-analysis.js';
import { applyGateConfiguredRules } from '../../config/gate-configured-rules/gate-configured-rules.js';
import type {
  BaselineConfig,
  ModulePlacementConfig,
  PackageBoundariesConfig,
} from '../../config/global-config/global-config.js';
import {
  packagedAssetsDirectory,
  packagedFallowConfigPath,
} from '../../config/packaged-assets/packaged-assets.js';
import { resolvePresetContract } from '../../preset-catalog/catalog/preset-catalog.js';
import {
  runActivePresetPreflights,
  runActivePresetToolChecks,
} from '../../preset-catalog/load-check/load-preset-check.js';
import type { ActivatedPreset } from '../../preset-catalog/contract/preset-contract.types.js';
import {
  formatManagedFileMismatches,
  verifyManagedPresetFiles,
} from '../../preset-catalog/reconcile/reconcile-preset-files.js';
import {
  formatDependencyViolations,
  formatIgnoreScriptsViolations,
  verifyPresetDependencies,
} from '../../preset-catalog/dependencies/verify-preset-dependencies.js';
import {
  oxlintTypeAwareEnabled,
  writeOxlintConfigForProject,
} from '../../preset-catalog/oxlint-config/write-oxlint-config.js';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.types.js';
import { QualityGateInternalError } from '../quality-gate-run/quality-gate-internal-error.js';
import { formatVerifyOk } from './verify-ok-message.js';
import { runNodeProcess } from '../../process/run-node-tool/run-node-tool.js';
import { joinStreams, mergeIgnorePatterns } from '../../process/run-command/stream-utils.js';
import { scheduleVerifyRunStats } from '../run-stats/verify-run-stats.js';
import { timedTool, withVerifyTiming } from './verify-timing.js';
import {
  applyIgnoredOxlintRules,
  fallowCliArgs,
  fallowExecutablePath,
  finishVerify,
  oxlintToolRun,
  removeFallowInformation,
  writeFallowConfigWithEntries,
} from './verify-tool-run.js';

const PACKAGED_FALLOW_CONFIG_PATH = packagedFallowConfigPath();
const PACKAGED_OXLINT_ASSETS_DIRECTORY = packagedAssetsDirectory();
const DATABASE_MANAGED_FILES_HINT =
  'hint:database-managed-files - follow the database test example at .aqg/database/tests/database.integration.test.ts.example';

export const TYPE_AWARE_OXLINT_TIMEOUT_MS = 120_000;

export const TYPE_AWARE_OXLINT_TIMEOUT_HINT = `hint:type-aware-timeout — oxlint type-aware (tsgo) exceeded ${String(TYPE_AWARE_OXLINT_TIMEOUT_MS / 1000)}s and was killed. Run tsc --noEmit for circular imports, then retry. Do not wait for tsgo.`;

function caughtErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : error;
}

function unwrapFulfilledTimedTool(settled: PromiseSettledResult<TimedToolRun>): TimedToolRun {
  if (settled.status === 'rejected') {
    throw settled.reason;
  }
  return settled.value;
}

function throwInternalVerifyFailure(error: Error | string): never {
  throw new QualityGateInternalError(caughtErrorMessage(error), {
    cause: error instanceof Error ? error : undefined,
  });
}

async function verifyPresetProjectPreconditions(
  projectRoot: string,
  contract: Awaited<ReturnType<typeof resolvePresetContract>>,
): Promise<VerifyResult | undefined> {
  const dependencies = await verifyPresetDependencies(
    projectRoot,
    contract.dependencies,
    contract.ignoreScripts,
  );
  if (!dependencies.ok) {
    const details = [
      formatDependencyViolations(dependencies.violations),
      formatIgnoreScriptsViolations(dependencies.ignoreScriptsViolations),
    ]
      .filter((section) => section.length > 0)
      .join('\n');
    return {
      exitCode: 1,
      stdout: '',
      stderr: `verify: preset dependency check failed\n${details}\n`,
    };
  }

  let presetPreflight;
  try {
    presetPreflight = await runActivePresetPreflights(projectRoot, contract.activated);
  } catch (error) {
    throwInternalVerifyFailure(error instanceof Error ? error : String(error));
  }
  return presetPreflight;
}

async function runPresetPreflight(
  projectRoot: string,
  presetNames: readonly string[],
  packageBoundaries: PackageBoundariesConfig | undefined,
  modulePlacement: ModulePlacementConfig | undefined,
  baseline: BaselineConfig | undefined,
  skipPresetProjectChecks: boolean,
  ephemeral: EphemeralProjectConfigPaths,
): Promise<
  | {
      oxlintConfigPath: string;
      typeAware: boolean;
      activated: ActivatedPreset[];
    }
  | VerifyResult
> {
  let contract;
  try {
    contract = await resolvePresetContract(presetNames);
  } catch (error) {
    throwInternalVerifyFailure(error instanceof Error ? error : String(error));
  }

  if (!skipPresetProjectChecks) {
    const preconditions = await verifyPresetProjectPreconditions(projectRoot, contract);
    if (preconditions !== undefined) {
      return preconditions;
    }
  }

  const managed = skipPresetProjectChecks
    ? { ok: true as const, mismatches: [] }
    : await verifyManagedPresetFiles(projectRoot, contract.files);
  if (!managed.ok) {
    return { exitCode: 1, stdout: '', stderr: `verify: ${managed.error}\n` };
  }

  const rules: Record<string, OxlintRuleSetting> = { ...contract.rules };
  applyGateConfiguredRules(rules, packageBoundaries, modulePlacement, baseline);

  const oxlintConfigPath = await writeOxlintConfigForProject(
    projectRoot,
    PACKAGED_OXLINT_ASSETS_DIRECTORY,
    contract.plugins,
    rules,
    contract.nativePlugins,
    contract.overrides,
  );
  ephemeral.oxlintConfigPath = oxlintConfigPath;
  const typeAware = oxlintTypeAwareEnabled(readOxlintConfig(PACKAGED_OXLINT_ASSETS_DIRECTORY));

  if (managed.mismatches.length > 0) {
    const databaseHint = managed.mismatches.some((mismatch) => mismatch.presetName === 'database')
      ? `${DATABASE_MANAGED_FILES_HINT}\n`
      : '';
    return {
      exitCode: 1,
      stdout: '',
      stderr: `verify: managed preset files do not match\n${formatManagedFileMismatches(managed.mismatches)}\n${databaseHint}`,
    };
  }

  return {
    oxlintConfigPath,
    typeAware,
    activated: contract.activated,
  };
}

function timingFieldsFromPhases(timings: PhaseTimings): {
  c: number;
  pl?: number;
  o?: number;
  sh?: number;
  cx?: number;
  pr?: number;
} {
  return {
    c: timings.cyclesMs,
    ...(timings.parallelMs === undefined ? {} : { pl: timings.parallelMs }),
    ...(timings.oxlintMs === undefined ? {} : { o: timings.oxlintMs }),
    ...(timings.skipHealthMs === undefined ? {} : { sh: timings.skipHealthMs }),
    ...(timings.complexityMs === undefined ? {} : { cx: timings.complexityMs }),
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
    });
    throw error;
  }
}

async function runExecuteVerify(
  request: VerifyRequest,
  run: ToolRunner,
  projectRoot: string,
): Promise<ExecuteVerifyOutcome> {
  const ephemeral: EphemeralProjectConfigPaths = {};
  try {
    return await runExecuteVerifyBody(request, run, projectRoot, ephemeral);
  } finally {
    await removeEphemeralProjectConfigs(ephemeral);
  }
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
    request.packageBoundaries,
    request.modulePlacement,
    request.baseline,
    request.skipPresetProjectChecks === true,
    ephemeral,
  );
  if ('exitCode' in preflight) {
    return { result: preflight };
  }

  const packagedFallow = await readFallowConfigFile(
    PACKAGED_FALLOW_CONFIG_PATH,
    FALLOW_CONFIG_NAME,
  );
  const ignorePatterns = mergeIgnorePatterns(
    packagedFallow.ignorePatterns ?? [],
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
  );
  ephemeral.fallowConfigPath = fallowConfigPath;
  const skipPresetChecks = request.skipPresetProjectChecks === true;
  const phasesStartedAt = performance.now();
  const runFallow = async (extraPrefix: readonly string[]) => {
    return await timedTool(async () => {
      return await run({
        name: 'fallow',
        args: fallowCliArgs(fallowExecutable, fallowConfigPath, projectRoot, extraPrefix),
        environment: fallowEnvironment,
        cwd: projectRoot,
        failurePrefix: 'verify: failed to start ',
      });
    });
  };
  const cycleRun = await runFallow(['dead-code', '--re-export-cycles', '--circular-deps']);
  if (cycleRun.result.exitCode !== 0) {
    const timings: PhaseTimings = { cyclesMs: cycleRun.ms };
    return {
      result: withVerifyTiming(
        {
          exitCode: cycleRun.result.exitCode,
          stdout: removeFallowInformation(cycleRun.result.stdout),
          stderr: cycleRun.result.stderr,
        },
        timings,
        phasesStartedAt,
      ),
      timings,
    };
  }

  const oxlintTimeoutMs = preflight.typeAware ? TYPE_AWARE_OXLINT_TIMEOUT_MS : undefined;
  const ignoreRuleIds = new Set(request.ignoreOxlintRuleIds ?? []);
  const parallelStartedAt = performance.now();
  const [oxlintSettled, skipHealthSettled, complexitySettled, presetsSettled] =
    await Promise.allSettled([
      timedTool(async () => {
        const raw = await run({
          name: 'oxlint',
          args: oxlintInvocation.args,
          environment: oxlintInvocation.environment,
          cwd: projectRoot,
          timeoutMs: oxlintTimeoutMs,
          timeoutMessage:
            oxlintTimeoutMs === undefined ? undefined : TYPE_AWARE_OXLINT_TIMEOUT_HINT,
          failurePrefix: 'verify: failed to start ',
        });
        return applyIgnoredOxlintRules(raw, ignoreRuleIds);
      }),
      runFallow(['--skip', 'health']),
      runFallow(['health', '--complexity']),
      timedTool(async () => {
        if (skipPresetChecks) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        try {
          const checks = await runActivePresetToolChecks(
            {
              projectRoot,
              entries: request.entries,
              ignorePatterns,
              fallowConfigPath,
            },
            preflight.activated,
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
  const oxlintTimed = unwrapFulfilledTimedTool(oxlintSettled);
  const skipHealthTimed = unwrapFulfilledTimedTool(skipHealthSettled);
  const complexityTimed = unwrapFulfilledTimedTool(complexitySettled);
  const presetsTimed = unwrapFulfilledTimedTool(presetsSettled);
  const parallelMs = Math.round(performance.now() - parallelStartedAt);
  const presetChecks = skipPresetChecks ? [] : [presetsTimed.result];
  const result = finishVerify(
    oxlintTimed.result,
    [skipHealthTimed.result, complexityTimed.result],
    presetChecks,
  );
  const timings: PhaseTimings = {
    cyclesMs: cycleRun.ms,
    parallelMs,
    oxlintMs: oxlintTimed.ms,
    skipHealthMs: skipHealthTimed.ms,
    complexityMs: complexityTimed.ms,
  };
  if (!skipPresetChecks) {
    timings.presetsMs = presetsTimed.ms;
  }
  if (result.exitCode === 0) {
    return {
      result: withVerifyTiming(
        { exitCode: 0, stdout: '', stderr: result.stderr },
        timings,
        phasesStartedAt,
      ),
      timings,
    };
  }
  return {
    result: withVerifyTiming(result, timings, phasesStartedAt),
    timings,
  };
}
