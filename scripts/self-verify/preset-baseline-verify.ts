import { join } from 'node:path';

import { executeVerify } from '../../gate/execute-verify/execute-verify.js';
import type {
  ToolRunner,
  VerifyRequest,
  VerifyResult,
} from '../../gate/execute-verify/execute-verify.types.js';
import { oxlintRuleIdsFromManifest } from '../../preset-catalog/oxlint-config/oxlint-rule-ids-from-manifest.js';
import { parsePresetManifest } from '../../preset-catalog/manifest/parse-preset-manifest.js';
import { runLocalPresetSteps } from './preset-verify-result.js';
import { listPresetPackageNames, resolveProjectRoot } from './repo-walk.js';

const PRESETS_DIRECTORY = 'presets';

/** Optional presets activated when self-checking each in-repo preset package. */
export const LOCAL_PRESET_PACKAGE_VERIFY_PRESETS = [
  'bun-parse',
  'config',
  'database',
  'module-placement',
  'playwright',
] as const;

const PRESET_PACKAGE_ENTRIES = [
  'check.ts',
  '*.ts',
  'payload/**/*.ts',
  'oxlint/**/*.{ts,mjs}',
] as const;

const PRESET_PACKAGE_IGNORE_PATTERNS = [
  '.quality-fixtures/**',
  'tests/**',
  'fixture/**',
  'migrations/**',
] as const;

const PRESET_PACKAGE_FALLOW_IGNORE_DEPENDENCIES = [
  '@testcontainers/postgresql',
  'testcontainers',
  '@oxlint/plugins',
  'oxc-parser',
  'valibot',
] as const;

export function listLocalPresetPackageNames(projectRoot: string): string[] {
  const root = resolveProjectRoot(projectRoot);
  return listPresetPackageNames(join(root, PRESETS_DIRECTORY));
}

export async function localPresetPackageVerifyRequest(
  projectRoot: string,
  presetName: string,
): Promise<VerifyRequest> {
  const root = resolveProjectRoot(projectRoot);
  const packageRoot = join(root, PRESETS_DIRECTORY, presetName);
  const manifest = await parsePresetManifest(join(packageRoot, 'manifest.json'));
  return {
    projectRoot: packageRoot,
    entries: [...PRESET_PACKAGE_ENTRIES],
    ignorePatterns: [...PRESET_PACKAGE_IGNORE_PATTERNS],
    fallowIgnoreDependencies: [...PRESET_PACKAGE_FALLOW_IGNORE_DEPENDENCIES],
    presets: [...LOCAL_PRESET_PACKAGE_VERIFY_PRESETS],
    skipPresetProjectChecks: true,
    baseline: { maxInlineParameterObjectMembers: 3 },
    ignoreOxlintRuleIds: oxlintRuleIdsFromManifest(manifest),
    okLabel: `preset package ${presetName}`,
  };
}

export async function verifyLocalPresetPackages(
  projectRoot: string,
  run?: ToolRunner,
): Promise<VerifyResult> {
  const root = resolveProjectRoot(projectRoot);
  return runLocalPresetSteps(
    listLocalPresetPackageNames(root),
    async (presetName) =>
      executeVerify(await localPresetPackageVerifyRequest(root, presetName), run),
    (presetName) => `verify: local preset "${presetName}" failed package verify\n`,
  );
}
