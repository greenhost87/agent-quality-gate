import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';

import type { CheckHint } from '../gate/run/check-hints.js';
import type { Diagnostic } from '../gate/run/check-result.js';
import { attachHintOwners } from '../gate/run/check-hints.js';
import type {
  ActivatedPreset,
  PresetOxlintOverride,
  ResolvedManagedFile,
} from './preset-contract.types.js';

import type { OxlintRuleSetting } from './write-oxlint-config.js';

export const PlainObjectSchema = v.looseObject({});
export type PlainObject = v.InferOutput<typeof PlainObjectSchema>;
export const PresetConfigBagSchema = v.record(v.string(), PlainObjectSchema);
export type PresetConfigBag = v.InferOutput<typeof PresetConfigBagSchema>;

export type PresetGateConfigModule = {
  parsePresetConfig: (raw: PlainObject | undefined) => PlainObject | undefined;
  applyConfiguredRules: (rules: Record<string, OxlintRuleSetting>, config: PlainObject) => void;
  applyConfiguredOverrides?: (overrides: PresetOxlintOverride[], config: PlainObject) => void;
  /** Hints for this preset's selected Oxlint findings. */
  hintsForDiagnostics?: (diagnostics: readonly Diagnostic[]) => readonly CheckHint[];
  /** Optional: relocate this preset's managed files using validated preset config. */
  resolveManagedFileDestination?: (destination: string, config: PlainObject) => string;
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
  const applyOverridesOk =
    !('applyConfiguredOverrides' in loaded) ||
    typeof loaded.applyConfiguredOverrides === 'function';
  const hintsForDiagnosticsOk =
    !('hintsForDiagnostics' in loaded) || typeof loaded.hintsForDiagnostics === 'function';
  const resolveManagedFileDestinationOk =
    !('resolveManagedFileDestination' in loaded) ||
    typeof loaded.resolveManagedFileDestination === 'function';
  return (
    typeof loaded.parsePresetConfig === 'function' &&
    typeof loaded.applyConfiguredRules === 'function' &&
    applyOverridesOk &&
    hintsForDiagnosticsOk &&
    resolveManagedFileDestinationOk
  );
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

export async function collectPresetDiagnosticHints(
  activated: readonly ActivatedPreset[],
  diagnostics: readonly Diagnostic[],
): Promise<CheckHint[]> {
  const hints = await Promise.all(
    activated.map(async (preset) => {
      const gateConfig = await loadPresetGateConfigModule(preset);
      return attachHintOwners(gateConfig?.hintsForDiagnostics?.(diagnostics), preset.name) ?? [];
    }),
  );
  return hints.flat();
}

export function toPresetConfigBag(presetConfig: Readonly<Record<string, object>>): PresetConfigBag {
  const parsed = v.safeParse(PresetConfigBagSchema, presetConfig);
  return parsed.success ? parsed.output : {};
}

async function loadParsedPresetConfig(
  preset: ActivatedPreset,
  bag: PresetConfigBag,
): Promise<{ gateConfig: PresetGateConfigModule; parsed: PlainObject } | undefined> {
  try {
    const gateConfig = await loadPresetGateConfigModule(preset);
    if (gateConfig === undefined) {
      return undefined;
    }
    const parsed = gateConfig.parsePresetConfig(bag[preset.name]);
    return parsed === undefined ? undefined : { gateConfig, parsed };
  } catch {
    return undefined;
  }
}

export async function applyPresetGateConfig(
  rules: Record<string, OxlintRuleSetting>,
  activated: readonly ActivatedPreset[],
  presetConfig: Readonly<Record<string, object>>,
  overrides?: PresetOxlintOverride[],
): Promise<void> {
  const bag = toPresetConfigBag(presetConfig);
  for (const preset of activated) {
    const configured = await loadParsedPresetConfig(preset, bag);
    if (configured === undefined) {
      continue;
    }
    configured.gateConfig.applyConfiguredRules(rules, configured.parsed);
    if (overrides !== undefined) {
      configured.gateConfig.applyConfiguredOverrides?.(overrides, configured.parsed);
    }
  }
}

export async function applyPresetManagedFileConfig(
  files: readonly ResolvedManagedFile[],
  activated: readonly ActivatedPreset[],
  presetConfig: Readonly<Record<string, object>>,
): Promise<ResolvedManagedFile[]> {
  const bag = toPresetConfigBag(presetConfig);
  let configuredFiles = [...files];
  for (const preset of activated) {
    const configured = await loadParsedPresetConfig(preset, bag);
    const resolver = configured?.gateConfig.resolveManagedFileDestination;
    if (configured === undefined || resolver === undefined) {
      continue;
    }
    configuredFiles = configuredFiles.map((file) =>
      file.presetName === preset.name
        ? { ...file, destination: resolver(file.destination, configured.parsed) }
        : file,
    );
  }
  return configuredFiles;
}
