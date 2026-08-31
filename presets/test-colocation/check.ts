import {
  fallowCacheEnvironment,
  listFallowDiscoveredFiles,
} from '../../gate/preflight/fallow-analysis.ts';
import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.ts';
import type {
  PresetCheckModule,
  PresetVerifyContext,
} from '../../preset-catalog/contract/preset-check.types.ts';
import { parsePresetConfig } from './gate-config.ts';
import {
  colocationListIgnorePatterns,
  findTestColocationViolationsFromRelativePaths,
} from './scan-test-colocation.ts';
import { formatPrefixedViolations } from '../../scripts/self-verify/repo-walk.ts';

async function testColocationBoundaryChecks(
  context: PresetVerifyContext,
  presetConfig?: object,
): Promise<ToolRunResult[]> {
  const config = parsePresetConfig(presetConfig);
  if (config === undefined) {
    return [
      {
        exitCode: 1,
        stdout: '',
        stderr:
          'verify: test-colocation requires presetConfig.test-colocation.policy (aqg-repository | application)\n',
      },
    ];
  }
  const listResult = await listFallowDiscoveredFiles({
    projectRoot: context.projectRoot,
    fallowConfigPath: context.fallowConfigPath,
    listIgnorePatterns: colocationListIgnorePatterns(context.ignorePatterns, config.policy),
    environment: fallowCacheEnvironment(context.projectRoot),
    failurePrefix: 'verify: ',
  });
  if (!listResult.ok) {
    return [listResult.result];
  }
  const violations = findTestColocationViolationsFromRelativePaths(listResult.files, config.policy);
  const formatted = formatPrefixedViolations(
    'test-colocation',
    violations.map((violation) => `${violation.path}: ${violation.reason}`),
  );
  return formatted.exitCode === 0 ? [] : [formatted];
}

const checkModule: PresetCheckModule = {
  runToolChecks: testColocationBoundaryChecks,
};

export const preflight = checkModule.preflight;
export const runToolChecks = checkModule.runToolChecks;
