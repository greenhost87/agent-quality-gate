import { file } from 'bun';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import * as v from 'valibot';

import type { StreamResult } from '#system/gate/public-verify/verify-streams.js';
import { formatStepOk } from '#system/gate/run/verify-ok-message.js';
import { runCapturedProcess } from '#system/process/run-command/run-command.js';
import { hasBunLockfile } from './has-bun-lockfile.js';
import {
  failedLocalPresetVerify,
  runLocalPresetSteps,
  type PresetStepExecution,
} from '#system/gate/public-verify/preset-verify-result.js';
import { isBunTestParallelEnabled } from '../self-test/bun-test-parallel.js';

import { withLocalPresetExecutionRoot } from './local-preset-root.js';
import { SHIPPED_PRESET_NAMES } from '#system/presets/preset-catalog.js';
import { listPresetPackageNames, resolveProjectRoot } from './repo-walk.js';

const PRESETS_DIRECTORY = 'presets';
export const LOCAL_REPOSITORY_PRESET_NAMES = new Set([...SHIPPED_PRESET_NAMES, 'nextjs']);

const PackageObjectSchema = v.looseObject({});
const ScriptsObjectSchema = v.looseObject({});

async function readPackageObject(packageJsonPath: string): Promise<object> {
  const raw: unknown = await file(packageJsonPath).json();
  const parsed = v.safeParse(PackageObjectSchema, raw);
  return parsed.success ? parsed.output : {};
}

export function packageScript(packageJson: object, scriptName: string): string | undefined {
  if (!('scripts' in packageJson)) {
    return undefined;
  }
  const scripts = v.safeParse(ScriptsObjectSchema, packageJson.scripts);
  if (!scripts.success) {
    return undefined;
  }
  if (!Object.hasOwn(scripts.output, scriptName)) {
    return undefined;
  }
  const script: unknown = Reflect.get(scripts.output, scriptName);
  return typeof script === 'string' && script.length > 0 ? script : undefined;
}

export async function listLocalPresetPackNamesWithScript(
  projectRoot: string,
  scriptName: string,
): Promise<string[]> {
  const root = resolveProjectRoot(projectRoot);
  const presetsRoot = join(root, PRESETS_DIRECTORY);
  const names: string[] = [];
  for (const name of listPresetPackageNames(presetsRoot)) {
    if (!LOCAL_REPOSITORY_PRESET_NAMES.has(name)) {
      continue;
    }
    const packageJsonPath = join(presetsRoot, name, 'package.json');
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    if (packageScript(await readPackageObject(packageJsonPath), scriptName) !== undefined) {
      names.push(name);
    }
  }
  return names;
}

export async function listLocalPresetPackVerifyNames(projectRoot: string): Promise<string[]> {
  return listLocalPresetPackNamesWithScript(projectRoot, 'verify');
}

export async function listLocalPresetPackTestNames(projectRoot: string): Promise<string[]> {
  return listLocalPresetPackNamesWithScript(projectRoot, 'test');
}

export async function ensurePresetDependencies(
  presetRoot: string,
  presetName: string,
  step: string,
): Promise<StreamResult | null> {
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
): Promise<StreamResult> {
  const root = resolveProjectRoot(options.projectRoot);
  const names = (await listLocalPresetPackNamesWithScript(root, options.scriptName)).filter(
    (name) => options.exclude === undefined || !options.exclude.has(name),
  );
  return runLocalPresetSteps(
    names,
    async (presetName) => {
      const startedAt = performance.now();
      const sourceRoot = join(root, PRESETS_DIRECTORY, presetName);
      const physicalSourceRoot = await realpath(sourceRoot);
      const runPack = async (presetRoot: string): Promise<StreamResult> => {
        const installFailure = await ensurePresetDependencies(presetRoot, presetName, options.step);
        if (installFailure !== null) {
          return installFailure;
        }
        const pack = await runCapturedProcess({
          command: 'bun',
          args: ['run', options.scriptName],
          cwd: presetRoot,
          environment:
            presetRoot === sourceRoot ? {} : { AQG_LINKED_PRESET_SOURCE_ROOT: physicalSourceRoot },
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
      };
      if (options.scriptName === 'fmt') {
        return runPack(sourceRoot);
      }
      return withLocalPresetExecutionRoot(join(root, PRESETS_DIRECTORY), presetName, runPack);
    },
    (presetName) =>
      `${options.step}: local preset "${presetName}" failed pack ${options.failureKind}\n`,
    options.execution,
  );
}

export async function verifyLocalPresetPacks(projectRoot: string): Promise<StreamResult> {
  return runSameNamedPackScript(projectRoot, 'verify');
}

export async function listLocalPresetPackFmtNames(projectRoot: string): Promise<string[]> {
  return listLocalPresetPackNamesWithScript(projectRoot, 'fmt');
}

export async function formatLocalPresetPacks(projectRoot: string): Promise<StreamResult> {
  return runSameNamedPackScript(projectRoot, 'fmt');
}

async function runSameNamedPackScript(
  projectRoot: string,
  scriptName: string,
): Promise<StreamResult> {
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
): Promise<StreamResult> {
  return runLocalPresetPackScript({
    projectRoot,
    scriptName: options?.scriptName ?? 'test',
    step: 'test',
    okWhat: (presetName) => `pack ${presetName}${options?.okSuffix ?? ''}`,
    failureKind: options?.failureKind ?? 'test',
    exclude: options?.exclude,
    execution: isBunTestParallelEnabled() ? 'parallel' : 'sequential',
  });
}

export async function listLocalPresetPackIntegrationTestNames(
  projectRoot: string,
): Promise<string[]> {
  return listLocalPresetPackNamesWithScript(projectRoot, 'test:integration');
}

export async function testLocalPresetPackIntegrations(projectRoot: string): Promise<StreamResult> {
  return testLocalPresetPacks(projectRoot, {
    scriptName: 'test:integration',
    failureKind: 'integration',
    okSuffix: ' integration',
    exclude: new Set(),
  });
}

export type RunLocalPresetPackScriptOptions = {
  projectRoot: string;
  scriptName: string;
  step: string;
  okWhat: (presetName: string) => string;
  failureKind: string;
  exclude?: ReadonlySet<string>;
  execution?: PresetStepExecution;
};

export type TestLocalPresetPacksOptions = {
  scriptName?: string;
  failureKind?: string;
  okSuffix?: string;
  exclude?: ReadonlySet<string>;
};
