import { isAbsolute, resolve } from 'node:path';

import { oxlintConfigPathForProject } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import {
  readOxlintConfig,
  type OxlintConfig,
  type OxlintJsPlugin,
} from '../../config/verify-config-files/verify-config-files.js';
import { writeTextIfChanged } from '../../process/files/files.js';
import type {
  PresetOxlintOverride,
  ResolvedOxlintPlugin,
} from '../contract/preset-contract.types.js';
import { normalizeOxlintRuleSetting } from './oxlint-rule-phase.js';
import type { OxlintRulePhase, OxlintRuleSeverity } from './oxlint-rule-setting.js';

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

  const mergedNativePlugins = [...baseNativePlugins];
  for (const plugin of nativePlugins) {
    if (!mergedNativePlugins.includes(plugin)) {
      mergedNativePlugins.push(plugin);
    }
  }

  const config: OxlintConfig = {
    ...base,
    plugins: mergedNativePlugins,
    jsPlugins: mergedPlugins,
    rules: normalizeRuleRecord({
      ...existingRules,
      ...rules,
    }),
    overrides: [...baseOverrides, ...overrides.map(overrideToJson)],
  };

  const configPath = oxlintConfigPathForProject(projectRoot);
  await writeTextIfChanged(configPath, `export default ${JSON.stringify(config, null, 2)};\n`);
  return configPath;
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
