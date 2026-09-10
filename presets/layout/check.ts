import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CheckResult } from '../../gate/execute-verify/check-result.ts';
import { failedCheckResult } from '../../gate/execute-verify/check-result.ts';
import {
  fallowCacheEnvironment,
  listFallowDiscoveredFiles,
} from '../../gate/preflight/fallow-analysis.ts';
import type {
  PresetCheckModule,
  PresetVerifyContext,
} from '../../preset-catalog/contract/preset-check.types.ts';
import { formatPrefixedViolations } from '../../scripts/self-verify/repo-walk.ts';
import {
  parsePresetConfig,
  type LayoutGateConfig,
  type ModulePlacementGateConfig,
} from './gate-config.ts';
import {
  findDirectoryCapacityViolations,
  findRouteCompositionViolations,
  routeModuleReferences,
  type RouteCompositionPolicy,
} from './scan-module-placement.ts';
import {
  colocationListIgnorePatterns,
  findTestColocationViolationsFromRelativePaths,
} from './scan-test-colocation.ts';

async function listLayoutFiles(
  context: PresetVerifyContext,
  listIgnorePatterns: readonly string[],
): Promise<{ ok: true; files: readonly string[] } | { ok: false; result: CheckResult }> {
  return listFallowDiscoveredFiles({
    projectRoot: context.projectRoot,
    fallowConfigPath: context.fallowConfigPath,
    listIgnorePatterns,
    environment: fallowCacheEnvironment(context.projectRoot),
    failurePrefix: 'verify: ',
  });
}

async function placementBoundaryChecks(
  context: PresetVerifyContext,
  placement: ModulePlacementGateConfig | undefined,
): Promise<CheckResult[]> {
  if (
    placement === undefined ||
    (Object.keys(placement.maxFilesPerDirectory).length === 0 &&
      Object.keys(placement.routeCompositionRoots).length === 0)
  ) {
    return [];
  }
  const listResult = await listLayoutFiles(context, context.ignorePatterns);
  if (!listResult.ok) {
    return [listResult.result];
  }
  const violations = findDirectoryCapacityViolations(
    listResult.files,
    placement.maxFilesPerDirectory,
  );
  const routePolicies: RouteCompositionPolicy[] = [];
  for (const [root, policy] of Object.entries(placement.routeCompositionRoots)) {
    let source: string;
    try {
      source = await readFile(join(context.projectRoot, policy.manifest), 'utf8');
    } catch {
      return [
        failedCheckResult(
          1,
          `verify: layout/placement cannot read route manifest ${policy.manifest}`,
        ),
      ];
    }
    routePolicies.push({
      manifest: policy.manifest,
      presentationRoot: policy.presentationRoot,
      root,
      routeModules: routeModuleReferences(source, root, policy.manifest),
    });
  }
  const routeViolations = findRouteCompositionViolations(listResult.files, routePolicies);
  const capacityGrouped = violations.map((violation) => ({
    source: 'layout',
    ruleId: 'layout/placement',
    severity: 'error' as const,
    message: 'TypeScript modules exceed directory capacity',
    location: { path: violation.directory },
    groupHeader: `layout/placement: per-directory limit ${String(violation.limit)} under ${violation.root}; split the directory by concern`,
  }));
  const routeFormatted = formatPrefixedViolations(
    'layout/placement',
    routeViolations.map(
      (violation) =>
        `${violation.path}: ${violation.root} is route-composition-only and this module is not referenced by ${violation.manifest}; move views and UI components to ${violation.presentationRoot}/<concern>/`,
    ),
  );
  const diagnostics = [...capacityGrouped, ...routeFormatted.diagnostics];
  if (diagnostics.length === 0) {
    return [];
  }
  return [{ exitCode: 1, diagnostics }];
}

async function testColocationBoundaryChecks(
  context: PresetVerifyContext,
  layout: LayoutGateConfig,
): Promise<CheckResult[]> {
  if (layout.testColocationInvalid === true) {
    return [
      failedCheckResult(
        1,
        'verify: layout/testColocation requires policy (aqg-repository | application); legacy key: presetConfig.test-colocation.policy',
      ),
    ];
  }
  if (layout.testColocation === undefined) {
    return [];
  }
  const listResult = await listLayoutFiles(
    context,
    colocationListIgnorePatterns(context.ignorePatterns, layout.testColocation.policy),
  );
  if (!listResult.ok) {
    return [listResult.result];
  }
  const violations = findTestColocationViolationsFromRelativePaths(
    listResult.files,
    layout.testColocation.policy,
  );
  const formatted = formatPrefixedViolations(
    'layout/test-colocation',
    violations.map((violation) => `${violation.path}: ${violation.reason}`),
  );
  return formatted.exitCode === 0 ? [] : [formatted];
}

async function layoutBoundaryChecks(
  context: PresetVerifyContext,
  presetConfig?: object,
): Promise<CheckResult[]> {
  const layout = parsePresetConfig(presetConfig);
  if (layout === undefined) {
    return [];
  }
  const [placementResults, colocationResults] = await Promise.all([
    placementBoundaryChecks(context, layout.placement),
    testColocationBoundaryChecks(context, layout),
  ]);
  return [...placementResults, ...colocationResults];
}

const checkModule: PresetCheckModule = {
  runToolChecks: layoutBoundaryChecks,
};

export const runToolChecks = checkModule.runToolChecks;
