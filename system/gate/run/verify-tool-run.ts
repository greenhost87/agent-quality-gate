import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as v from 'valibot';

import { agentQualityGateHome } from '#system/config/agent-quality-gate-home.js';
import { fallowConfigPathForProject } from '#system/config/project-artifacts.js';
import {
  FALLOW_CONFIG_NAME,
  readFallowConfigFile,
} from '#system/config/verify-config-files/verify-config-files.js';
import { writeTextIfChanged } from '#system/process/files/files.js';
import { getOptionalEnv } from '../read-env/read-env.js';
import { checkResultFromDiagnostics, failedCheckResult, type CheckResult } from './check-result.js';
import { diagnosticsFromOxlintJson, parseOxlintJsonOutput } from './oxlint/json.js';
import { filterIgnoredOxlintDiagnostics } from './oxlint/diagnostics.js';
import type { ToolRunResult } from './execute-verify.js';

const require = createRequire(import.meta.url);

export function packageRoot(packageName: string): string {
  return dirname(require.resolve(`${packageName}/package.json`));
}

export function fallowExecutablePath(): string {
  const override = getOptionalEnv('FALLOW_PATH');
  if (override !== undefined) {
    return override;
  }
  const custom = join(agentQualityGateHome(), 'fallow-custom', 'bin', 'fallow');
  return existsSync(custom)
    ? custom
    : join(dirname(require.resolve('fallow/package.json')), 'bin', 'fallow');
}

function customFallowExecutablePath(): string {
  return join(agentQualityGateHome(), 'fallow-custom', 'bin', 'fallow');
}

/** Whether verify runs on the custom Fallow fork (which supports cache.dir). */
export function isCustomFallowExecutable(): boolean {
  return fallowExecutablePath() === customFallowExecutablePath();
}

/**
 * `cache.dir` config entry for generated Fallow configs. Only the custom
 * fork honors it; the packaged binary ignores the key (and then writes no
 * cache at all), so it is omitted there — the packaged runs still land in
 * the same directory via `FALLOW_CACHE_DIR`.
 */
export function fallowCacheConfigEntry(
  cacheDir?: string,
): { cache: { dir: string } } | Record<string, never> {
  if (cacheDir === undefined || !isCustomFallowExecutable()) {
    return {};
  }
  return { cache: { dir: cacheDir } };
}

export function tsgolintPath(): string {
  if (
    (process.platform !== 'darwin' && process.platform !== 'linux') ||
    (process.arch !== 'arm64' && process.arch !== 'x64')
  ) {
    throw new Error(`agent-quality-gate: unsupported platform ${process.platform}-${process.arch}`);
  }
  const tsgolintRequire = createRequire(require.resolve('oxlint-tsgolint/package.json'));
  const nativePackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  return join(dirname(tsgolintRequire.resolve(`${nativePackage}/package.json`)), 'tsgolint');
}

export function oxlintToolRun(
  configPath: string,
  ignorePatterns: readonly string[] = [],
  fix = false,
): { args: string[]; environment: Record<string, string> } {
  const eslintPluginRoot = dirname(packageRoot('oxlint-plugin-eslint'));
  const nodePath = [eslintPluginRoot, getOptionalEnv('NODE_PATH')]
    .filter((value) => value !== undefined)
    .join(':');
  return {
    environment: {
      NODE_PATH: nodePath,
      OXLINT_TSGOLINT_PATH: tsgolintPath(),
    },
    args: [
      join(packageRoot('oxlint'), 'bin', 'oxlint'),
      '--format',
      'json',
      '--deny-warnings',
      ...(fix ? ['--fix'] : []),
      '--config',
      configPath,
      ...ignorePatterns.flatMap((pattern) => ['--ignore-pattern', pattern]),
      '.',
    ],
  };
}

export async function writeFallowConfigWithEntries(
  packagedFallowPath: string,
  projectRoot: string,
  entries: readonly string[],
  ignorePatterns: readonly string[],
  fallowIgnoreDependencies: readonly string[] = [],
  enabledRules?: readonly string[],
  configPath: string = fallowConfigPathForProject(projectRoot),
  uiConfig: {
    intrinsicInteractions?: readonly Readonly<Record<string, unknown>>[];
    lifecycleCallbacks?: readonly string[];
    actionCompatibility?: Readonly<Record<string, readonly string[]>>;
  } = {},
  extraRules: Readonly<Record<string, string>> = {},
  cacheDir?: string,
  duplicatesIgnoreDefaults?: boolean,
  // Scope override for the written config (e.g. `false` for the second
  // launch: unscoped dupes + ui coverage, verified section-identical to the
  // scoped config on real projects).
  production?: boolean | { deadCode?: boolean; health?: boolean; dupes?: boolean },
): Promise<string> {
  const packaged = await readFallowConfigFile(packagedFallowPath, FALLOW_CONFIG_NAME);
  const packagedDuplicates = v.safeParse(v.looseObject({}), packaged.duplicates);
  const rules = {
    ...Object.fromEntries(
      Object.entries(packaged.rules ?? {}).map(([ruleId, severity]) => [
        ruleId,
        enabledRules === undefined || enabledRules.includes(ruleId) ? severity : 'off',
      ]),
    ),
    ...extraRules,
  };
  await writeTextIfChanged(
    configPath,
    `${JSON.stringify(
      {
        ...packaged,
        ...fallowCacheConfigEntry(cacheDir),
        ...(production === undefined ? {} : { production }),
        rules,
        entry: [...entries],
        ignorePatterns: [...ignorePatterns],
        ignoreDependencies: [...(packaged.ignoreDependencies ?? []), ...fallowIgnoreDependencies],
        ...(duplicatesIgnoreDefaults === undefined
          ? {}
          : {
              duplicates: {
                ...(packagedDuplicates.success ? packagedDuplicates.output : {}),
                ignoreDefaults: duplicatesIgnoreDefaults,
              },
            }),
        ...(uiConfig.intrinsicInteractions === undefined
          ? {}
          : { intrinsicInteractions: uiConfig.intrinsicInteractions }),
        ...(uiConfig.lifecycleCallbacks === undefined
          ? {}
          : { lifecycleCallbacks: uiConfig.lifecycleCallbacks }),
        ...(uiConfig.actionCompatibility === undefined
          ? {}
          : { actionCompatibility: uiConfig.actionCompatibility }),
      },
      null,
      2,
    )}\n`,
  );
  return configPath;
}

/**
 * Parse oxlint JSON stdout into structured diagnostics and drop ignored rule ids.
 * Invalid JSON or config/launch failures stay as execution failures — never as a clean pass.
 * Ignore filtering cannot suppress an accompanying tool/execution failure.
 */
export function checkResultFromOxlintToolRun(
  oxlintRaw: ToolRunResult,
  ignoreRuleIds: ReadonlySet<string>,
): CheckResult {
  const parsed = parseOxlintJsonOutput(oxlintRaw.stdout);
  if (!parsed.ok) {
    return oxlintParseFailureResult(oxlintRaw, parsed.reason);
  }

  const allDiagnostics = diagnosticsFromOxlintJson(parsed.output);
  const executionFailure = oxlintExecutionFailureBeforeIgnore(oxlintRaw, allDiagnostics.length);
  const filtered = filterIgnoredOxlintDiagnostics(allDiagnostics, ignoreRuleIds);
  if (filtered.hasRemainingIssues) {
    return checkResultFromDiagnostics(filtered.diagnostics, {
      exitCode: Math.max(oxlintRaw.exitCode, executionFailure?.exitCode ?? 0, 1),
      ...(executionFailure === undefined
        ? {}
        : {
            failures: executionFailure.failures,
            ...(executionFailure.opaqueText === undefined
              ? {}
              : { opaqueText: executionFailure.opaqueText }),
          }),
    });
  }
  if (executionFailure !== undefined) {
    return executionFailure;
  }
  return checkResultFromDiagnostics([]);
}

/** Only a normal lint exit with findings can be cleared by ignore filtering. */
function oxlintExecutionFailureBeforeIgnore(
  oxlintRaw: ToolRunResult,
  findingCount: number,
): CheckResult | undefined {
  if (
    (oxlintRaw.exitCode === 0 || (oxlintRaw.exitCode === 1 && findingCount > 0)) &&
    oxlintRaw.stderr.trim().length === 0
  ) {
    return undefined;
  }
  const detail = firstNonEmptyTrimmed(
    oxlintRaw.stderr,
    `oxlint returned an unexpected process result (exit ${String(oxlintRaw.exitCode)}, ${String(findingCount)} findings)`,
  );
  return failedCheckResult(Math.max(1, oxlintRaw.exitCode), detail, {
    stdout: oxlintRaw.stdout,
    stderr: oxlintRaw.stderr,
  });
}

function oxlintParseFailureResult(oxlintRaw: ToolRunResult, parseReason: string): CheckResult {
  return failedCheckResult(
    oxlintRaw.exitCode === 0 ? 1 : oxlintRaw.exitCode,
    firstNonEmptyTrimmed(oxlintRaw.stderr, oxlintRaw.stdout, parseReason),
    {
      stdout: oxlintRaw.stdout,
      stderr: oxlintRaw.stderr,
    },
  );
}

function firstNonEmptyTrimmed(...parts: readonly string[]): string {
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      return part.trimEnd();
    }
  }
  return '';
}
