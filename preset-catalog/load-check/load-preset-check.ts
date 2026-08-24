import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.types.js';
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
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as PresetCheckModule;
  const preflightOk =
    candidate.preflight === undefined || typeof candidate.preflight === 'function';
  const toolChecksOk =
    candidate.runToolChecks === undefined || typeof candidate.runToolChecks === 'function';
  if (!preflightOk || !toolChecksOk) {
    return false;
  }
  return candidate.preflight !== undefined || candidate.runToolChecks !== undefined;
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
): Promise<ToolRunResult | undefined> {
  for (const preset of activated) {
    let checkModule: PresetCheckModule | undefined;
    try {
      checkModule = await loadPresetCheckModule(preset);
    } catch (error) {
      return failedCheckModuleResult(error instanceof Error ? error : String(error));
    }
    const result = await checkModule?.preflight?.(projectRoot);
    if (result !== undefined && result.exitCode !== 0) {
      return result;
    }
  }
  return undefined;
}

export async function runActivePresetToolChecks(
  context: PresetVerifyContext,
  activated: readonly ActivatedPreset[],
): Promise<ToolRunResult[]> {
  const results: ToolRunResult[] = [];
  for (const preset of activated) {
    let checkModule: PresetCheckModule | undefined;
    try {
      checkModule = await loadPresetCheckModule(preset);
    } catch (error) {
      results.push(failedCheckModuleResult(error instanceof Error ? error : String(error)));
      continue;
    }
    if (checkModule?.runToolChecks === undefined) {
      continue;
    }
    results.push(...(await checkModule.runToolChecks(context)));
  }
  return results;
}
