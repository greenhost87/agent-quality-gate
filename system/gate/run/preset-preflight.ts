import type { EphemeralProjectConfigPaths } from './ephemeral-project-configs.js';
import { readOxlintConfig } from '#system/config/verify-config-files/verify-config-files.js';
import { packagedAssetsDirectory } from '#system/config/packaged-assets/packaged-assets.js';
import { resolvePresetContract } from '#system/presets/preset-catalog.js';
import { runActivePresetPreflights } from '#system/presets/load-preset-check.js';
import {
  applyPresetGateConfig,
  applyPresetManagedFileConfig,
} from '#system/presets/load-preset-gate-config.js';
import type {
  ActivatedPreset,
  ResolvedPresetContract,
} from '#system/presets/preset-contract.types.js';
import {
  formatManagedFileMismatches,
  verifyManagedPresetFiles,
} from '#system/presets/reconcile-preset-files.js';
import { opaqueCheckResult } from './check-result.js';
import type { OxlintGroupOrderOptions } from './execute-verify.js';
import {
  formatDependencyViolations,
  formatIgnoreScriptsViolations,
  verifyPresetDependencies,
} from '#system/presets/verify-preset-dependencies.js';
import { verifyProjectDependenciesInstalled } from '../preflight/project-install.js';
import {
  oxlintTypeAwareEnabled,
  writeOxlintConfigForProject,
} from '#system/presets/write-oxlint-config.js';
import type { OxlintRuleSetting } from '#system/presets/write-oxlint-config.js';
import { throwInternalVerifyFailure } from '../quality-gate-run/quality-gate-internal-error.js';
import type { VerifyResult } from './execute-verify.js';
import type { OxlintOutputGroup } from './execute-verify.js';
import { oxlintVirtualGroupsFromRules } from './oxlint/virtual-groups.js';
import * as v from 'valibot';

const PACKAGED_OXLINT_ASSETS_DIRECTORY = packagedAssetsDirectory();
const DATABASE_MANAGED_FILES_HINT_EXAMPLES =
  'hint:database-examples — .aqg/database/database-examples.md';
const DATABASE_MANAGED_FILES_HINT_SYNC =
  'hint:database-sync — bun .aqg/database/scripts/sync-database-managed.ts';
const DATABASE_MANAGED_FILES_HINT = `${DATABASE_MANAGED_FILES_HINT_EXAMPLES}\n${DATABASE_MANAGED_FILES_HINT_SYNC}`;

async function verifyPresetProjectPreconditions(
  projectRoot: string,
  contract: Awaited<ReturnType<typeof resolvePresetContract>>,
  presetConfig: Readonly<Record<string, object>>,
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
    return opaqueCheckResult(1, `verify: preset dependency check failed\n${details}\n`);
  }

  const installPreflight = await verifyProjectDependenciesInstalled(projectRoot);
  if (installPreflight !== undefined) {
    return installPreflight;
  }

  let presetPreflight;
  try {
    presetPreflight = await runActivePresetPreflights(
      projectRoot,
      contract.activated,
      presetConfig,
    );
  } catch (error) {
    throwInternalVerifyFailure(error instanceof Error ? error : String(error));
  }
  return presetPreflight;
}

export function groupOrderOptions(request: {
  lintGroups?: readonly string[];
  boundaryPluginPriority?: readonly string[];
}): OxlintGroupOrderOptions {
  return {
    ...(request.lintGroups === undefined || request.lintGroups.length === 0
      ? {}
      : { groupOrder: request.lintGroups }),
    ...(request.boundaryPluginPriority === undefined || request.boundaryPluginPriority.length === 0
      ? {}
      : { boundaryPluginPriority: request.boundaryPluginPriority }),
  };
}

export type PreparedPresetChecks = {
  contract: ResolvedPresetContract;
  activated: ActivatedPreset[];
  managedFilePaths: ReadonlySet<string>;
};

export async function preparePresetChecks(
  projectRoot: string,
  presetNames: readonly string[],
  presetConfig: Readonly<Record<string, object>>,
  skipPresetProjectChecks = false,
): Promise<PreparedPresetChecks | VerifyResult> {
  let contract;
  try {
    const resolvedContract = await resolvePresetContract(presetNames);
    contract = {
      ...resolvedContract,
      files: await applyPresetManagedFileConfig(
        resolvedContract.files,
        resolvedContract.activated,
        presetConfig,
      ),
    };
  } catch (error) {
    return throwInternalVerifyFailure(error instanceof Error ? error : String(error));
  }

  if (!skipPresetProjectChecks) {
    const preconditions = await verifyPresetProjectPreconditions(
      projectRoot,
      contract,
      presetConfig,
    );
    if (preconditions !== undefined) return preconditions;
  }

  const managed = skipPresetProjectChecks
    ? { ok: true as const, mismatches: [] }
    : await verifyManagedPresetFiles(projectRoot, contract.files);
  if (!managed.ok) return opaqueCheckResult(1, `verify: ${managed.error}\n`);
  if (managed.mismatches.length > 0) {
    const databaseHint = managed.mismatches.some((mismatch) => mismatch.presetName === 'database')
      ? `${DATABASE_MANAGED_FILES_HINT}\n`
      : '';
    return opaqueCheckResult(
      1,
      `verify: managed preset files do not match\n${formatManagedFileMismatches(managed.mismatches)}\n${databaseHint}`,
    );
  }

  return {
    contract,
    activated: contract.activated,
    managedFilePaths: new Set(
      contract.files
        .filter((file) => file.exampleOnly !== true)
        .map((file) => file.destination.replaceAll('\\', '/')),
    ),
  };
}

export async function runPresetPreflight(
  projectRoot: string,
  presetNames: readonly string[],
  presetConfig: Readonly<Record<string, object>>,
  skipPresetProjectChecks: boolean,
  _ephemeral: EphemeralProjectConfigPaths,
  groupOrderOptions: OxlintGroupOrderOptions = {},
): Promise<
  | {
      oxlintConfigPath: string;
      typeAware: boolean;
      activated: ActivatedPreset[];
      managedFilePaths: ReadonlySet<string>;
      contract: ResolvedPresetContract;
      lintGroups: OxlintOutputGroup[];
    }
  | VerifyResult
> {
  const prepared = await preparePresetChecks(
    projectRoot,
    presetNames,
    presetConfig,
    skipPresetProjectChecks,
  );
  if ('exitCode' in prepared) return prepared;
  const { contract } = prepared;
  const rules: Record<string, OxlintRuleSetting> = { ...contract.rules };
  const overrides = contract.overrides.map((override) => ({
    files: [...override.files],
    rules: { ...override.rules },
  }));
  await applyPresetGateConfig(rules, contract.activated, presetConfig, overrides);

  const oxlintConfigPath = await writeOxlintConfigForProject(
    projectRoot,
    PACKAGED_OXLINT_ASSETS_DIRECTORY,
    contract.plugins,
    rules,
    contract.nativePlugins,
    overrides,
  );
  const packagedOxlint = readOxlintConfig(PACKAGED_OXLINT_ASSETS_DIRECTORY);
  const typeAware = oxlintTypeAwareEnabled(packagedOxlint);
  const packagedLintRuleIds = [
    ...Object.keys(packagedOxlint.rules ?? {}),
    ...(packagedOxlint.overrides ?? []).flatMap((override) => {
      const overrideRules = override['rules'];
      return v.is(v.looseObject({}), overrideRules) ? Object.keys(overrideRules) : [];
    }),
  ];
  const lintGroups = oxlintVirtualGroupsFromRules(
    rules,
    overrides,
    packagedLintRuleIds,
    groupOrderOptions,
  );

  return {
    oxlintConfigPath,
    typeAware,
    activated: prepared.activated,
    managedFilePaths: prepared.managedFilePaths,
    contract,
    lintGroups,
  };
}
