import { join } from 'node:path';

import { executeVerify } from '#system/gate/run/execute-verify.js';
import type { ToolRunner, VerifyRequest } from '#system/gate/run/execute-verify.js';
import { parsePresetManifest } from '#system/presets/parse-preset-manifest.js';
import { oxlintRuleIdsFromManifest } from '#system/presets/write-oxlint-config.js';
import { runLocalPresetSteps } from '#system/gate/public-verify/preset-verify-result.js';
import {
  streamResultFromVerifyResult,
  type StreamResult,
} from '#system/gate/public-verify/verify-streams.js';
import { withLocalPresetExecutionRoot } from './local-preset-root.js';
import { ensurePresetDependencies, LOCAL_REPOSITORY_PRESET_NAMES } from './preset-pack-run.js';
import { listPresetPackageNames, resolveProjectRoot } from './repo-walk.js';

const PRESETS_DIRECTORY = 'presets';

/** Optional presets activated when self-checking each in-repo preset package. */
export const LOCAL_PRESET_PACKAGE_VERIFY_PRESETS = [
  'bun-parse',
  'config',
  'database',
  'layout',
  'playwright',
] as const;

function packageVerifyPresets(presetName: string): string[] {
  if (presetName === 'database-sqlite') {
    return [
      ...LOCAL_PRESET_PACKAGE_VERIFY_PRESETS.filter((name) => name !== 'database'),
      'database-sqlite',
    ];
  }
  return [...LOCAL_PRESET_PACKAGE_VERIFY_PRESETS];
}

const PRESET_PACKAGE_ENTRIES = [
  'check.ts',
  'gate-config.ts',
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
  'agent-quality-gate',
  'testcontainers',
  '@oxlint/plugins',
  'oxc-parser',
  'valibot',
] as const;

export function listLocalPresetPackageNames(projectRoot: string): string[] {
  const root = resolveProjectRoot(projectRoot);
  return listPresetPackageNames(join(root, PRESETS_DIRECTORY)).filter((name) =>
    LOCAL_REPOSITORY_PRESET_NAMES.has(name),
  );
}

export async function localPresetPackageVerifyRequest(
  projectRoot: string,
  presetName: string,
  executionRoot?: string,
): Promise<VerifyRequest> {
  const root = resolveProjectRoot(projectRoot);
  const packageRoot = executionRoot ?? join(root, PRESETS_DIRECTORY, presetName);
  const manifest = await parsePresetManifest(join(packageRoot, 'manifest.json'));
  return {
    projectRoot: packageRoot,
    entries: [...PRESET_PACKAGE_ENTRIES],
    ignorePatterns: [...PRESET_PACKAGE_IGNORE_PATTERNS],
    fallowIgnoreDependencies: [...PRESET_PACKAGE_FALLOW_IGNORE_DEPENDENCIES],
    presets: packageVerifyPresets(presetName),
    skipPresetProjectChecks: true,
    presetConfig: {
      baseline: { maxInlineParameterObjectMembers: 3 },
    },
    ignoreOxlintRuleIds: oxlintRuleIdsFromManifest(manifest),
    okLabel: `preset package ${presetName}`,
  };
}

export async function verifyLocalPresetPackages(
  projectRoot: string,
  run?: ToolRunner,
): Promise<StreamResult> {
  const root = resolveProjectRoot(projectRoot);
  return runLocalPresetSteps(
    listLocalPresetPackageNames(root),
    async (presetName) =>
      withLocalPresetExecutionRoot(
        join(root, PRESETS_DIRECTORY),
        presetName,
        async (presetRoot) => {
          const sourceRoot = join(root, PRESETS_DIRECTORY, presetName);
          if (presetRoot !== sourceRoot) {
            const installFailure = await ensurePresetDependencies(presetRoot, presetName, 'verify');
            if (installFailure !== null) {
              return installFailure;
            }
          }
          return streamResultFromVerifyResult(
            await executeVerify(
              await localPresetPackageVerifyRequest(root, presetName, presetRoot),
              run,
            ),
          );
        },
      ),
    (presetName) => `verify: local preset "${presetName}" failed package verify\n`,
  );
}
