import { isAbsolute, resolve } from 'node:path';

import * as v from 'valibot';

import { verifyOxlintConfigPathForProject } from '../config/project-artifacts.ts';
import {
  readOxlintConfig,
  type OxlintConfig,
  type OxlintJsPlugin,
  type OxlintOverride,
} from '../config/verify-config-files/verify-config-files.ts';
import { writeTextIfChanged } from '../process/files/files.ts';
import type {
  PresetManifest,
  PresetOxlintOverride,
  ResolvedOxlintPlugin,
} from './preset-contract.types.ts';
export const OXLINT_RULE_SEVERITIES = ['error', 'warn', 'off'] as const;

export type OxlintRuleSeverity = (typeof OXLINT_RULE_SEVERITIES)[number];

/** Verify pipeline classes an oxlint rule can be assigned to; order is owned by the Gate. */
export const OXLINT_RULE_PHASES = ['boundaries', 'contracts', 'ui', 'lint'] as const;

export type OxlintRulePhase = (typeof OXLINT_RULE_PHASES)[number];

/** Rules without an explicit phase tag stay in the semantic lint phase. */
export const DEFAULT_OXLINT_RULE_PHASE: OxlintRulePhase = 'lint';

/** Phase an oxlint rule belongs to; rules without a tag default to the lint phase. */
export function oxlintRulePhaseOf(setting: OxlintRuleSetting): OxlintRulePhase {
  if (typeof setting === 'string') {
    return DEFAULT_OXLINT_RULE_PHASE;
  }
  return 'phase' in setting && setting.phase !== undefined
    ? setting.phase
    : DEFAULT_OXLINT_RULE_PHASE;
}

/** Strip manifest-only phase metadata so the value is a plain oxlint config setting. */
export function normalizeOxlintRuleSetting(
  setting: OxlintRuleSetting,
): OxlintRuleSeverity | readonly [OxlintRuleSeverity, object] {
  if (typeof setting === 'string') {
    return setting;
  }
  if (!('severity' in setting)) {
    return setting;
  }
  if (setting.options === undefined) {
    return setting.severity;
  }
  return [setting.severity, setting.options];
}

/** Rule ids contributed by a preset manifest (`oxlint.rules` and override rules). */
export function oxlintRuleIdsFromManifest(manifest: PresetManifest): string[] {
  const ids = new Set<string>(Object.keys(manifest.oxlint.rules));
  for (const override of manifest.oxlint.overrides) {
    for (const ruleId of Object.keys(override.rules)) {
      ids.add(ruleId);
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function normalizeRuleRecord(
  rules: Readonly<Record<string, OxlintRuleSetting>>,
): Record<string, OxlintRuleSeverity | readonly [OxlintRuleSeverity, object]> {
  return Object.fromEntries(
    Object.entries(rules).map(([ruleId, setting]) => [ruleId, normalizeOxlintRuleSetting(setting)]),
  );
}

function withAbsoluteSpecifier(
  plugin: OxlintJsPlugin,
  packagedOxlintAssetsDirectory: string,
): OxlintJsPlugin {
  const specifier = plugin.specifier;
  if (specifier === undefined || isAbsolute(specifier) || !specifier.startsWith('.')) {
    return plugin;
  }
  return {
    ...plugin,
    specifier: resolve(packagedOxlintAssetsDirectory, specifier),
  };
}

function overrideToJson(override: PresetOxlintOverride): {
  files: string[];
  rules: Record<string, OxlintRuleSeverity | readonly [OxlintRuleSeverity, object]>;
} {
  return {
    files: [...override.files],
    rules: normalizeRuleRecord(override.rules),
  };
}

const oxlintTupleRuleSettingSchema = v.tuple([v.string(), v.looseObject({})]);
const oxlintObjectRuleSettingSchema = v.looseObject({
  severity: v.string(),
  options: v.optional(v.looseObject({})),
  phase: v.optional(v.string()),
});
const oxlintRuleSettingSchema = v.union([
  v.string(),
  oxlintTupleRuleSettingSchema,
  oxlintObjectRuleSettingSchema,
]);
const oxlintRuleSettingsSchema = v.record(v.string(), oxlintRuleSettingSchema);
const overrideRulesSchema = v.looseObject({
  rules: v.optional(oxlintRuleSettingsSchema),
});
type OxlintRuleSettingValue = v.InferOutput<typeof oxlintRuleSettingSchema>;
type OxlintRuleSettings = v.InferOutput<typeof oxlintRuleSettingsSchema>;

function ruleSeverity(setting: OxlintRuleSettingValue): string {
  const stringSetting = v.safeParse(v.string(), setting);
  if (stringSetting.success) {
    return stringSetting.output;
  }
  const tupleSetting = v.safeParse(oxlintTupleRuleSettingSchema, setting);
  if (tupleSetting.success) {
    return tupleSetting.output[0];
  }
  const objectSetting = v.safeParse(oxlintObjectRuleSettingSchema, setting);
  return objectSetting.success ? objectSetting.output.severity : 'error';
}

function pluginRuleState(
  pluginName: string,
  rules: Readonly<OxlintRuleSettings>,
  overrides: readonly OxlintOverride[],
): 'enabled' | 'disabled' | 'unconfigured' {
  const prefix = `${pluginName}/`;
  const matchingSettings = Object.entries(rules).filter(([ruleId]) => ruleId.startsWith(prefix));
  for (const override of overrides) {
    const parsed = v.safeParse(overrideRulesSchema, override);
    if (!parsed.success || parsed.output.rules === undefined) {
      continue;
    }
    matchingSettings.push(
      ...Object.entries(parsed.output.rules).filter(([ruleId]) => ruleId.startsWith(prefix)),
    );
  }
  if (matchingSettings.length === 0) {
    // Keep plugins with no namespaced rules: some plugins expose non-rule APIs.
    return 'unconfigured';
  }
  return matchingSettings.some(([, setting]) => ruleSeverity(setting) !== 'off')
    ? 'enabled'
    : 'disabled';
}

function withoutDisabledPluginRules<Setting>(
  rules: Readonly<Record<string, Setting>>,
  pluginNames: ReadonlySet<string>,
): Record<string, Setting> {
  return Object.fromEntries(
    Object.entries(rules).filter(([ruleId]) => {
      for (const pluginName of pluginNames) {
        if (ruleId.startsWith(`${pluginName}/`)) {
          return false;
        }
      }
      return true;
    }),
  );
}

export function oxlintTypeAwareEnabled(config: OxlintConfig): boolean {
  const options = config.options;
  if (options === undefined) {
    return false;
  }
  return options.typeAware === true || options.typeCheck === true;
}

export async function writeOxlintConfigForProject(
  projectRoot: string,
  packagedOxlintAssetsDirectory: string,
  plugins: readonly ResolvedOxlintPlugin[],
  rules: Readonly<Record<string, OxlintRuleSetting>>,
  nativePlugins: readonly string[] = [],
  overrides: readonly PresetOxlintOverride[] = [],
): Promise<string> {
  const base = readOxlintConfig(packagedOxlintAssetsDirectory);
  const jsPlugins = (base.jsPlugins ?? []).map((plugin) =>
    withAbsoluteSpecifier(plugin, packagedOxlintAssetsDirectory),
  );
  const existingRules = base.rules ?? {};
  const baseNativePlugins = base.plugins ?? [];
  const baseOverrides = base.overrides ?? [];

  const mergedRules = {
    ...existingRules,
    ...normalizeRuleRecord(rules),
  };
  const mergedOverrides = [...baseOverrides, ...overrides.map(overrideToJson)];
  const mergedPlugins = [...jsPlugins];
  for (const plugin of plugins) {
    const index = mergedPlugins.findIndex((entry) => entry.name === plugin.name);
    const next = { name: plugin.name, specifier: plugin.absoluteSpecifier };
    if (index >= 0) {
      mergedPlugins[index] = next;
    } else {
      mergedPlugins.push(next);
    }
  }
  const parsedRules = v.safeParse(oxlintRuleSettingsSchema, mergedRules);
  const rulesForPluginChecks = parsedRules.success ? parsedRules.output : undefined;
  const disabledPluginNames = new Set(
    rulesForPluginChecks === undefined
      ? []
      : mergedPlugins.flatMap((plugin) =>
          plugin.name !== undefined &&
          pluginRuleState(plugin.name, rulesForPluginChecks, mergedOverrides) === 'disabled'
            ? [plugin.name]
            : [],
        ),
  );
  const withoutDisabledRules = (value: OxlintOverride): OxlintOverride => {
    const parsed = v.safeParse(overrideRulesSchema, value);
    if (!parsed.success || parsed.output.rules === undefined) {
      return value;
    }
    return {
      ...value,
      rules: withoutDisabledPluginRules(parsed.output.rules, disabledPluginNames),
    };
  };
  const configuredOverrides = mergedOverrides.map(withoutDisabledRules);

  const mergedNativePlugins = [...baseNativePlugins];
  for (const plugin of nativePlugins) {
    if (!mergedNativePlugins.includes(plugin)) {
      mergedNativePlugins.push(plugin);
    }
  }

  const config: OxlintConfig = {
    ...base,
    plugins: mergedNativePlugins,
    jsPlugins: mergedPlugins.filter(
      (plugin) => plugin.name === undefined || !disabledPluginNames.has(plugin.name),
    ),
    // The packaged config already contains native Oxlint settings. Only preset
    // settings carry AQG phase metadata and need normalization.
    rules: withoutDisabledPluginRules(mergedRules, disabledPluginNames),
    overrides: configuredOverrides,
  };

  const configPath = verifyOxlintConfigPathForProject(projectRoot);
  await writeTextIfChanged(configPath, `export default ${JSON.stringify(config, null, 2)};\n`);
  return configPath;
}

/**
 * Attach presetConfig tuning options onto a manifest rule setting.
 * Preserves phase for object form; replaces options for string and tuple forms.
 */
export function applyConfiguredRule(
  rules: Record<string, OxlintRuleSetting>,
  ruleName: string,
  options: object,
): void {
  const setting = rules[ruleName];
  if (setting === undefined) {
    return;
  }
  if (typeof setting === 'string') {
    rules[ruleName] = [setting, options];
    return;
  }
  if ('severity' in setting) {
    rules[ruleName] = {
      severity: setting.severity,
      ...(setting.phase === undefined ? {} : { phase: setting.phase }),
      options,
    };
    return;
  }
  rules[ruleName] = [setting[0], options];
}

export type OxlintRuleSetting =
  | OxlintRuleSeverity
  | readonly [OxlintRuleSeverity, object]
  | {
      severity: OxlintRuleSeverity;
      options?: object;
      /** Verify phase this rule's findings surface in; defaults to the lint phase. */
      phase?: OxlintRulePhase;
    };
