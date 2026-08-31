import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.ts';
import {
  fallowCacheEnvironment,
  listFallowDiscoveredFiles,
} from '../../gate/preflight/fallow-analysis.ts';
import type {
  PresetCheckModule,
  PresetVerifyContext,
} from '../../preset-catalog/contract/preset-check.types.ts';
import { formatPrefixedViolations } from '../../scripts/self-verify/repo-walk.ts';
import { parsePresetConfig } from './gate-config.ts';
import {
  findDirectoryCapacityViolations,
  findRouteCompositionViolations,
  routeModuleReferences,
  type RouteCompositionPolicy,
} from './scan-module-placement.ts';

async function modulePlacementBoundaryChecks(
  context: PresetVerifyContext,
  presetConfig?: object,
): Promise<ToolRunResult[]> {
  const config = parsePresetConfig(presetConfig);
  if (
    config === undefined ||
    (Object.keys(config.maxFilesPerDirectory).length === 0 &&
      Object.keys(config.routeCompositionRoots).length === 0)
  ) {
    return [];
  }
  const listResult = await listFallowDiscoveredFiles({
    projectRoot: context.projectRoot,
    fallowConfigPath: context.fallowConfigPath,
    listIgnorePatterns: context.ignorePatterns,
    environment: fallowCacheEnvironment(context.projectRoot),
    failurePrefix: 'verify: ',
  });
  if (!listResult.ok) {
    return [listResult.result];
  }
  const violations = findDirectoryCapacityViolations(listResult.files, config.maxFilesPerDirectory);
  const routePolicies: RouteCompositionPolicy[] = [];
  for (const [root, policy] of Object.entries(config.routeCompositionRoots)) {
    let source: string;
    try {
      source = await readFile(join(context.projectRoot, policy.manifest), 'utf8');
    } catch {
      return [
        {
          exitCode: 1,
          stdout: '',
          stderr: `verify: module-placement cannot read route manifest ${policy.manifest}\n`,
        },
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
  const formatted = formatPrefixedViolations('module-placement', [
    ...violations.map(
      (violation) =>
        `${violation.directory}: ${String(violation.count)} TypeScript modules exceed the per-directory limit of ${String(violation.limit)} under ${violation.root}; split the directory by concern`,
    ),
    ...routeViolations.map(
      (violation) =>
        `${violation.path}: ${violation.root} is route-composition-only and this module is not referenced by ${violation.manifest}; move views and UI components to ${violation.presentationRoot}/<concern>/`,
    ),
  ]);
  return formatted.exitCode === 0 ? [] : [formatted];
}

const checkModule: PresetCheckModule = {
  runToolChecks: modulePlacementBoundaryChecks,
};

export const runToolChecks = checkModule.runToolChecks;
