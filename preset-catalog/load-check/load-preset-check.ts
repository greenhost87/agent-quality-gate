import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';

import { opaqueCheckResult, type CheckResult } from '../../gate/execute-verify/check-result.js';
import { attachHintOwners } from '../../gate/execute-verify/check-hints.js';
import type { ActivatedPreset } from '../contract/preset-contract.types.js';
import type { PresetCheckModule, PresetVerifyContext } from '../contract/preset-check.types.js';
import { PRESET_CHECK_MODULE_BASENAMES } from '../contract/preset-check.types.js';
import {
  loadPresetGateConfigModule,
  rawConfigForPreset,
  toPresetConfigBag,
} from '../load-gate-config/load-preset-gate-config.js';

function withAttachedHintOwners(result: CheckResult, owner: string): CheckResult {
  const hints = attachHintOwners(result.hints, owner);
  if (hints === undefined) {
    if (result.hints === undefined) {
      return result;
    }
    const { hints: _removed, ...rest } = result;
    return rest;
  }
  return { ...result, hints };
}

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

function failedCheckModuleResult(error: Error | string): CheckResult {
  const message = error instanceof Error ? error.message : error;
  return opaqueCheckResult(1, `${message}\n`);
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

async function loadModuleOrFail<T>(
  load: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; result: CheckResult }> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    return {
      ok: false,
      result: failedCheckModuleResult(error instanceof Error ? error : String(error)),
    };
  }
}

async function resolvePresetCheckRawConfig(
  preset: ActivatedPreset,
  bag: ReturnType<typeof toPresetConfigBag>,
): Promise<
  | { ok: true; checkModule: PresetCheckModule | undefined; raw: object | undefined }
  | { ok: false; result: CheckResult }
> {
  const checkLoaded = await loadModuleOrFail(async () => loadPresetCheckModule(preset));
  if (!checkLoaded.ok) {
    return checkLoaded;
  }
  const gateLoaded = await loadModuleOrFail(async () => loadPresetGateConfigModule(preset));
  if (!gateLoaded.ok) {
    return gateLoaded;
  }
  const gateConfig = gateLoaded.value;
  const raw =
    gateConfig === undefined ? bag[preset.name] : rawConfigForPreset(gateConfig, preset.name, bag);
  return { ok: true, checkModule: checkLoaded.value, raw };
}

export async function runActivePresetPreflights(
  projectRoot: string,
  activated: readonly ActivatedPreset[],
  presetConfig: Readonly<Record<string, object>> = {},
): Promise<CheckResult | undefined> {
  const bag = toPresetConfigBag(presetConfig);
  for (const preset of activated) {
    const loaded = await resolvePresetCheckRawConfig(preset, bag);
    if (!loaded.ok) {
      return loaded.result;
    }
    const result = await loaded.checkModule?.preflight?.(projectRoot, loaded.raw);
    if (result !== undefined && result.exitCode !== 0) {
      return withAttachedHintOwners(result, preset.name);
    }
  }
  return undefined;
}

async function runPresetToolChecks(
  preset: ActivatedPreset,
  context: PresetVerifyContext,
  bag: ReturnType<typeof toPresetConfigBag>,
): Promise<CheckResult[]> {
  const loaded = await resolvePresetCheckRawConfig(preset, bag);
  if (!loaded.ok) {
    return [loaded.result];
  }
  if (loaded.checkModule?.runToolChecks === undefined) {
    return [];
  }
  const results = await loaded.checkModule.runToolChecks(context, loaded.raw);
  return results.map((result) => withAttachedHintOwners(result, preset.name));
}

export async function runActivePresetToolChecks(
  context: PresetVerifyContext,
  activated: readonly ActivatedPreset[],
  presetConfig: Readonly<Record<string, object>> = {},
): Promise<CheckResult[]> {
  const bag = toPresetConfigBag(presetConfig);
  const perPreset = await Promise.allSettled(
    activated.map(async (preset) => runPresetToolChecks(preset, context, bag)),
  );
  const results: CheckResult[] = [];
  for (const settled of perPreset) {
    if (settled.status === 'rejected') {
      throw settled.reason;
    }
    results.push(...settled.value);
  }
  return results;
}
