import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';

import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.js';
import type { ActivatedPreset } from '../contract/preset-contract.types.js';
import type { PresetCheckModule, PresetVerifyContext } from '../contract/preset-check.types.js';
import { PRESET_CHECK_MODULE_BASENAMES } from '../contract/preset-check.types.js';

function checkModulePath(presetRoot: string): string | undefined {
  for (const basename of PRESET_CHECK_MODULE_BASENAMES) {
    const candidate = join(presetRoot, basename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function isPresetCheckModule(value: unknown): value is PresetCheckModule {
  const moduleResult = v.safeParse(v.looseObject({}), value);
  if (!moduleResult.success) {
    return false;
  }
  const loaded = moduleResult.output;
  if (!('preflight' in loaded) && !('runToolChecks' in loaded)) {
    return false;
  }
  const preflight = 'preflight' in loaded ? loaded.preflight : undefined;
  const runToolChecks = 'runToolChecks' in loaded ? loaded.runToolChecks : undefined;
  const preflightOk = preflight === undefined || typeof preflight === 'function';
  const toolChecksOk = runToolChecks === undefined || typeof runToolChecks === 'function';
  if (!preflightOk || !toolChecksOk) {
    return false;
  }
  return preflight !== undefined || runToolChecks !== undefined;
}

async function importPresetCheckModule(modulePath: string): Promise<PresetCheckModule> {
  const loaded: unknown = await import(pathToFileURL(modulePath).href);
  if (!isPresetCheckModule(loaded)) {
    throw new Error(`preset check module ${modulePath} must export preflight and/or runToolChecks`);
  }
  return loaded;
}

function failedCheckModuleResult(error: Error | string): ToolRunResult {
  const message = error instanceof Error ? error.message : error;
  return { exitCode: 1, stdout: '', stderr: `${message}\n` };
}

async function loadPresetCheckModule(
  preset: ActivatedPreset,
): Promise<PresetCheckModule | undefined> {
  const modulePath = checkModulePath(preset.root);
  if (modulePath === undefined) {
    return undefined;
  }
  return importPresetCheckModule(modulePath);
}

export async function runActivePresetPreflights(
  projectRoot: string,
  activated: readonly ActivatedPreset[],
  presetConfig: Readonly<Record<string, object>> = {},
): Promise<ToolRunResult | undefined> {
  for (const preset of activated) {
    let checkModule: PresetCheckModule | undefined;
    try {
      checkModule = await loadPresetCheckModule(preset);
    } catch (error) {
      return failedCheckModuleResult(error instanceof Error ? error : String(error));
    }
    const result = await checkModule?.preflight?.(projectRoot, presetConfig[preset.name]);
    if (result !== undefined && result.exitCode !== 0) {
      return result;
    }
  }
  return undefined;
}

async function runPresetToolChecks(
  preset: ActivatedPreset,
  context: PresetVerifyContext,
  presetConfig?: object,
): Promise<ToolRunResult[]> {
  let checkModule: PresetCheckModule | undefined;
  try {
    checkModule = await loadPresetCheckModule(preset);
  } catch (error) {
    return [failedCheckModuleResult(error instanceof Error ? error : String(error))];
  }
  if (checkModule?.runToolChecks === undefined) {
    return [];
  }
  return checkModule.runToolChecks(context, presetConfig);
}

export async function runActivePresetToolChecks(
  context: PresetVerifyContext,
  activated: readonly ActivatedPreset[],
  presetConfig: Readonly<Record<string, object>> = {},
): Promise<ToolRunResult[]> {
  const perPreset = await Promise.all(
    activated.map(async (preset) =>
      runPresetToolChecks(preset, context, presetConfig[preset.name]),
    ),
  );
  return perPreset.flat();
}
