import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';

import type { ActivatedPreset } from '../contract/preset-contract.types.js';

import type { OxlintRuleSetting } from '../oxlint-config/write-oxlint-config.js';

export const PlainObjectSchema = v.looseObject({});
export type PlainObject = v.InferOutput<typeof PlainObjectSchema>;
export const PresetConfigBagSchema = v.record(v.string(), PlainObjectSchema);
export type PresetConfigBag = v.InferOutput<typeof PresetConfigBagSchema>;

export type PresetGateConfigModule = {
  parsePresetConfig: (raw: PlainObject | undefined) => PlainObject | undefined;
  applyConfiguredRules: (rules: Record<string, OxlintRuleSetting>, config: PlainObject) => void;
  /** Optional: build this preset's raw config from the full presetConfig bag (legacy keys). */
  resolveRawConfig?: (presetConfig: PresetConfigBag) => PlainObject | undefined;
};

export const PRESET_GATE_CONFIG_MODULE_BASENAMES = ['gate-config.js', 'gate-config.ts'] as const;

function gateConfigModulePath(presetRoot: string): string | undefined {
  for (const basename of PRESET_GATE_CONFIG_MODULE_BASENAMES) {
    const candidate = join(presetRoot, basename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function isPresetGateConfigModule(value: unknown): value is PresetGateConfigModule {
  const moduleResult = v.safeParse(v.looseObject({}), value);
  if (!moduleResult.success) {
    return false;
  }
  const loaded = moduleResult.output;
  if (!('parsePresetConfig' in loaded) || !('applyConfiguredRules' in loaded)) {
    return false;
  }
  const resolveRawOk =
    !('resolveRawConfig' in loaded) || typeof loaded.resolveRawConfig === 'function';
  return (
    typeof loaded.parsePresetConfig === 'function' &&
    typeof loaded.applyConfiguredRules === 'function' &&
    resolveRawOk
  );
}

export function rawConfigForPreset(
  gateConfig: PresetGateConfigModule,
  presetName: string,
  presetConfig: PresetConfigBag,
): PlainObject | undefined {
  if (gateConfig.resolveRawConfig !== undefined) {
    return gateConfig.resolveRawConfig(presetConfig);
  }
  return presetConfig[presetName];
}

async function importPresetGateConfigModule(modulePath: string): Promise<PresetGateConfigModule> {
  const loaded: unknown = await import(pathToFileURL(modulePath).href);
  if (!isPresetGateConfigModule(loaded)) {
    throw new Error(
      `preset gate-config module ${modulePath} must export parsePresetConfig and applyConfiguredRules`,
    );
  }
  return loaded;
}

async function loadPresetGateConfigModule(
  preset: ActivatedPreset,
): Promise<PresetGateConfigModule | undefined> {
  const modulePath = gateConfigModulePath(preset.root);
  if (modulePath === undefined) {
    return undefined;
  }
  return importPresetGateConfigModule(modulePath);
}

export { loadPresetGateConfigModule };

export function toPresetConfigBag(presetConfig: Readonly<Record<string, object>>): PresetConfigBag {
  const parsed = v.safeParse(PresetConfigBagSchema, presetConfig);
  return parsed.success ? parsed.output : {};
}

export async function applyPresetGateConfig(
  rules: Record<string, OxlintRuleSetting>,
  activated: readonly ActivatedPreset[],
  presetConfig: Readonly<Record<string, object>>,
): Promise<void> {
  const bag = toPresetConfigBag(presetConfig);
  for (const preset of activated) {
    let gateConfig: PresetGateConfigModule | undefined;
    try {
      gateConfig = await loadPresetGateConfigModule(preset);
    } catch {
      continue;
    }
    if (gateConfig === undefined) {
      continue;
    }
    let parsed: PlainObject | undefined;
    try {
      parsed = gateConfig.parsePresetConfig(rawConfigForPreset(gateConfig, preset.name, bag));
    } catch {
      continue;
    }
    if (parsed === undefined) {
      continue;
    }
    gateConfig.applyConfiguredRules(rules, parsed);
  }
}
