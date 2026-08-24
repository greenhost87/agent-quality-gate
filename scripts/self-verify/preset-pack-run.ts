import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { VerifyResult } from '../../gate/execute-verify/execute-verify.types.js';
import { formatStepOk } from '../../gate/execute-verify/verify-ok-message.js';
import { readTextFileSync } from '../../process/files/files.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';
import { hasBunLockfile } from './has-bun-lockfile.js';
import { failedLocalPresetVerify, runLocalPresetSteps } from './preset-verify-result.js';
import type {
  RunLocalPresetPackScriptOptions,
  TestLocalPresetPacksOptions,
} from './preset-pack-run.types.js';
import { listPresetPackageNames, resolveProjectRoot } from './repo-walk.js';

const PRESETS_DIRECTORY = 'presets';

/** Packs whose tests already run via the root `bun test` paths in self-test. */
export const ROOT_TEST_COVERED_PACKS = new Set(['playwright']);

function readPackageObject(packageJsonPath: string): object {
  const parsed: unknown = JSON.parse(readTextFileSync(packageJsonPath)) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed;
}

export function packageScript(packageJson: object, scriptName: string): string | undefined {
  if (!('scripts' in packageJson)) {
    return undefined;
  }
  const scripts: unknown = packageJson.scripts;
  if (typeof scripts !== 'object' || scripts === null) {
    return undefined;
  }
  if (!Object.hasOwn(scripts, scriptName)) {
    return undefined;
  }
  const script: unknown = Reflect.get(scripts, scriptName);
  return typeof script === 'string' && script.length > 0 ? script : undefined;
}

export function listLocalPresetPackNamesWithScript(
  projectRoot: string,
  scriptName: string,
): string[] {
  const root = resolveProjectRoot(projectRoot);
  const presetsRoot = join(root, PRESETS_DIRECTORY);
  return listPresetPackageNames(presetsRoot).filter((name) => {
    const packageJsonPath = join(presetsRoot, name, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return false;
    }
    return packageScript(readPackageObject(packageJsonPath), scriptName) !== undefined;
  });
}

export function listLocalPresetPackVerifyNames(projectRoot: string): string[] {
  return listLocalPresetPackNamesWithScript(projectRoot, 'verify');
}

export function listLocalPresetPackTestNames(projectRoot: string): string[] {
  return listLocalPresetPackNamesWithScript(projectRoot, 'test').filter(
    (name) => !ROOT_TEST_COVERED_PACKS.has(name),
  );
}

async function ensurePresetDependencies(
  presetRoot: string,
  presetName: string,
  step: string,
): Promise<VerifyResult | null> {
  const installArgs = hasBunLockfile(presetRoot)
    ? (['install', '--frozen-lockfile'] as const)
    : (['install'] as const);
  const install = await runCapturedProcess({
    command: 'bun',
    args: installArgs,
    cwd: presetRoot,
  });
  if (install.exitCode === 0) {
    return null;
  }
  return failedLocalPresetVerify(
    install.exitCode,
    [install.stdout],
    `${step}: local preset "${presetName}" failed bun install\n`,
    install.stderr,
  );
}

async function runLocalPresetPackScript(
  options: RunLocalPresetPackScriptOptions,
): Promise<VerifyResult> {
  const root = resolveProjectRoot(options.projectRoot);
  const names = listLocalPresetPackNamesWithScript(root, options.scriptName).filter(
    (name) => options.exclude === undefined || !options.exclude.has(name),
  );
  return runLocalPresetSteps(
    names,
    async (presetName) => {
      const startedAt = performance.now();
      const presetRoot = join(root, PRESETS_DIRECTORY, presetName);
      const installFailure = await ensurePresetDependencies(presetRoot, presetName, options.step);
      if (installFailure !== null) {
        return installFailure;
      }
      const pack = await runCapturedProcess({
        command: 'bun',
        args: ['run', options.scriptName],
        cwd: presetRoot,
      });
      if (pack.exitCode !== 0) {
        return pack;
      }
      return {
        exitCode: 0,
        stdout: formatStepOk(
          options.step,
          options.okWhat(presetName),
          Math.round(performance.now() - startedAt),
        ),
        stderr: '',
      };
    },
    (presetName) =>
      `${options.step}: local preset "${presetName}" failed pack ${options.failureKind}\n`,
  );
}

export async function verifyLocalPresetPacks(projectRoot: string): Promise<VerifyResult> {
  return runSameNamedPackScript(projectRoot, 'verify');
}

export function listLocalPresetPackFmtNames(projectRoot: string): string[] {
  return listLocalPresetPackNamesWithScript(projectRoot, 'fmt');
}

export async function formatLocalPresetPacks(projectRoot: string): Promise<VerifyResult> {
  return runSameNamedPackScript(projectRoot, 'fmt');
}

async function runSameNamedPackScript(
  projectRoot: string,
  scriptName: string,
): Promise<VerifyResult> {
  return runLocalPresetPackScript({
    projectRoot,
    scriptName,
    step: scriptName,
    okWhat: (presetName) => `pack ${presetName}`,
    failureKind: scriptName,
  });
}

export async function testLocalPresetPacks(
  projectRoot: string,
  options?: TestLocalPresetPacksOptions,
): Promise<VerifyResult> {
  const exclude =
    options?.exclude === null ? undefined : (options?.exclude ?? ROOT_TEST_COVERED_PACKS);
  return runLocalPresetPackScript({
    projectRoot,
    scriptName: options?.scriptName ?? 'test',
    step: 'test',
    okWhat: (presetName) => `pack ${presetName}${options?.okSuffix ?? ''}`,
    failureKind: options?.failureKind ?? 'test',
    exclude,
  });
}

export function listLocalPresetPackIntegrationTestNames(projectRoot: string): string[] {
  return listLocalPresetPackNamesWithScript(projectRoot, 'test:integration');
}

export async function testLocalPresetPackIntegrations(projectRoot: string): Promise<VerifyResult> {
  return testLocalPresetPacks(projectRoot, {
    scriptName: 'test:integration',
    failureKind: 'integration',
    okSuffix: ' integration',
    exclude: null,
  });
}
