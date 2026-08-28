import type { EphemeralProjectConfigPaths } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { readOxlintConfig } from '../../config/verify-config-files/verify-config-files.js';
import { packagedAssetsDirectory } from '../../config/packaged-assets/packaged-assets.js';
import { resolvePresetContract } from '../../preset-catalog/catalog/preset-catalog.js';
import { runActivePresetPreflights } from '../../preset-catalog/load-check/load-preset-check.js';
import { applyPresetGateConfig } from '../../preset-catalog/load-gate-config/load-preset-gate-config.js';
import type { ActivatedPreset } from '../../preset-catalog/contract/preset-contract.types.js';
import {
  formatManagedFileMismatches,
  verifyManagedPresetFiles,
} from '../../preset-catalog/reconcile/reconcile-preset-files.js';
import type { OxlintGroupOrderOptions } from './execute-verify.js';
import {
  formatDependencyViolations,
  formatIgnoreScriptsViolations,
  verifyPresetDependencies,
} from '../../preset-catalog/dependencies/verify-preset-dependencies.js';
import {
  oxlintTypeAwareEnabled,
  writeOxlintConfigForProject,
} from '../../preset-catalog/oxlint-config/write-oxlint-config.js';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.js';
import { QualityGateInternalError } from '../quality-gate-run/quality-gate-internal-error.js';
import type { VerifyResult } from './execute-verify.js';
import type { OxlintOutputGroup } from './execute-verify.js';
import { oxlintVirtualGroupsFromRules } from './oxlint-virtual-groups.js';
import * as v from 'valibot';

const PACKAGED_OXLINT_ASSETS_DIRECTORY = packagedAssetsDirectory();
const DATABASE_MANAGED_FILES_HINT_EXAMPLES =
  'hint:database-examples — .aqg/database/database-examples.md';
const DATABASE_MANAGED_FILES_HINT_SYNC =
  'hint:database-sync — bun .aqg/database/scripts/sync-database-managed.ts';
const DATABASE_MANAGED_FILES_HINT = `${DATABASE_MANAGED_FILES_HINT_EXAMPLES}\n${DATABASE_MANAGED_FILES_HINT_SYNC}`;

function throwInternalVerifyFailure(error: Error | string): never {
  const message = error instanceof Error ? error.message : error;
  throw new QualityGateInternalError(message, {
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

export async function runPresetPreflight(
  projectRoot: string,
  presetNames: readonly string[],
  presetConfig: Readonly<Record<string, object>>,
  skipPresetProjectChecks: boolean,
  ephemeral: EphemeralProjectConfigPaths,
  groupOrderOptions: OxlintGroupOrderOptions = {},
): Promise<
  | {
      oxlintConfigPath: string;
      typeAware: boolean;
      activated: ActivatedPreset[];
      lintGroups: OxlintOutputGroup[];
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
  await applyPresetGateConfig(rules, contract.activated, presetConfig);

  const oxlintConfigPath = await writeOxlintConfigForProject(
    projectRoot,
    PACKAGED_OXLINT_ASSETS_DIRECTORY,
    contract.plugins,
    rules,
    contract.nativePlugins,
    contract.overrides,
  );
  ephemeral.oxlintConfigPath = oxlintConfigPath;
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
    contract.overrides,
    packagedLintRuleIds,
    groupOrderOptions,
  );

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
    lintGroups,
  };
}
