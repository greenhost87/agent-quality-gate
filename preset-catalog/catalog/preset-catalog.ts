import { existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { homeInstalledPresetRoot } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import type {
  ActivatedPreset,
  PresetManifest,
  PresetOxlintOverride,
  PresetProjectDependency,
  ResolvedManagedFile,
  ResolvedOxlintPlugin,
  ResolvedPresetContract,
} from '../contract/preset-contract.types.js';
import { parsePresetManifest } from '../manifest/parse-preset-manifest.js';
import type { OxlintRuleSetting } from '../oxlint-config/write-oxlint-config.js';

const PACKAGE_ROOT = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const BASELINE_PRESET_NAME = 'baseline';
export const SHIPPED_PRESET_NAMES = [
  'baseline',
  'bun-parse',
  'config',
  'database',
  'module-placement',
  'playwright',
] as const;

function presetsRoot(): string {
  const releaseRoot = join(PACKAGE_ROOT, 'dist', 'presets');
  if (existsSync(join(releaseRoot, BASELINE_PRESET_NAME, 'manifest.json'))) {
    return releaseRoot;
  }
  return join(PACKAGE_ROOT, 'presets');
}

export function isKnownPresetName(name: string): boolean {
  return SHIPPED_PRESET_NAMES.some((shipped) => shipped === name);
}

function isHomeInstalledPresetName(name: string): boolean {
  if (isKnownPresetName(name)) {
    return false;
  }
  return existsSync(join(homeInstalledPresetRoot(name), 'manifest.json'));
}

export function isResolvablePresetName(name: string): boolean {
  return isKnownPresetName(name) || isHomeInstalledPresetName(name);
}

function shippedPresetRoot(name: string): string {
  return join(presetsRoot(), name);
}

async function loadManifestAtRoot(root: string, expectedName?: string): Promise<PresetManifest> {
  const path = join(root, 'manifest.json');
  if (!existsSync(path)) {
    throw new Error(`preset "${expectedName ?? root}" is not packaged`);
  }
  const manifest = await parsePresetManifest(path);
  if (expectedName !== undefined && manifest.name !== expectedName) {
    throw new Error(`preset manifest ${path} name mismatch`);
  }
  return manifest;
}

async function resolvePresetReference(reference: string): Promise<ActivatedPreset> {
  if (isKnownPresetName(reference)) {
    const root = shippedPresetRoot(reference);
    const manifest = await loadManifestAtRoot(root, reference);
    return { name: manifest.name, root };
  }
  if (isHomeInstalledPresetName(reference)) {
    const root = homeInstalledPresetRoot(reference);
    const manifest = await loadManifestAtRoot(root, reference);
    return { name: manifest.name, root };
  }
  throw new Error(`unknown preset "${reference}"`);
}

function dedupeByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function activatePresets(requested: readonly ActivatedPreset[]): Promise<ActivatedPreset[]> {
  const activated: ActivatedPreset[] = [];
  const activatedRoots = new Set<string>();
  const visit = async (preset: ActivatedPreset): Promise<void> => {
    if (activatedRoots.has(preset.root)) {
      return;
    }
    const manifest = await loadManifestAtRoot(preset.root);
    for (const required of manifest.requires) {
      if (!isKnownPresetName(required)) {
        throw new Error(`unknown required preset "${required}"`);
      }
      await visit({ name: required, root: shippedPresetRoot(required) });
    }
    activatedRoots.add(preset.root);
    activated.push({ name: manifest.name, root: preset.root });
  };
  for (const preset of requested) {
    await visit(preset);
  }
  return activated;
}

function withBaseline(requested: readonly ActivatedPreset[]): ActivatedPreset[] {
  const baseline = {
    name: BASELINE_PRESET_NAME,
    root: shippedPresetRoot(BASELINE_PRESET_NAME),
  };
  const rest = requested.filter((preset) => preset.name !== BASELINE_PRESET_NAME);
  return [baseline, ...rest];
}

async function collectPresetContributions(
  activated: readonly ActivatedPreset[],
): Promise<ResolvedPresetContract> {
  const files: ResolvedManagedFile[] = [];
  const dependencies: PresetProjectDependency[] = [];
  const ignoreScripts: string[] = [];
  const nativePlugins: string[] = [];
  const plugins: ResolvedOxlintPlugin[] = [];
  const rules: Record<string, OxlintRuleSetting> = {};
  const overrides: PresetOxlintOverride[] = [];

  for (const preset of activated) {
    const manifest = await loadManifestAtRoot(preset.root);
    for (const file of manifest.files) {
      files.push({
        destination: file.destination,
        absoluteSource: resolve(preset.root, file.source),
        presetName: preset.name,
        contentHash: file.contentHash,
        exampleOnly: file.exampleOnly,
      });
    }
    dependencies.push(...manifest.dependencies);
    for (const packageName of manifest.ignoreScripts) {
      if (!ignoreScripts.includes(packageName)) {
        ignoreScripts.push(packageName);
      }
    }
    for (const plugin of manifest.oxlint.nativePlugins) {
      if (!nativePlugins.includes(plugin)) {
        nativePlugins.push(plugin);
      }
    }
    for (const plugin of manifest.oxlint.plugins) {
      plugins.push({
        name: plugin.name,
        absoluteSpecifier: resolve(preset.root, plugin.specifier),
      });
    }
    Object.assign(rules, manifest.oxlint.rules);
    overrides.push(...manifest.oxlint.overrides);
  }

  return {
    names: activated.map((preset) => preset.name),
    activated: [...activated],
    files: dedupeByKey(files, (file) => file.destination),
    dependencies: dedupeByKey(
      dependencies,
      (dependency) => `${dependency.section}:${dependency.name}`,
    ),
    ignoreScripts,
    nativePlugins,
    plugins: dedupeByKey(plugins, (plugin) => plugin.name),
    rules,
    overrides,
  };
}

export async function resolvePresetContract(
  references: readonly string[],
): Promise<ResolvedPresetContract> {
  const requested = dedupeByKey(
    await Promise.all(references.map(resolvePresetReference)),
    (preset) => preset.root,
  );
  return collectPresetContributions(await activatePresets(withBaseline(requested)));
}
