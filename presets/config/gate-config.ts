import { isAbsolute } from 'node:path';

import * as v from 'valibot';

import { applyConfiguredRule } from 'agent-quality-gate/shared/oxlint';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

export const DEFAULT_ENVIRONMENT_PATH = 'system/config/environment.ts';

function isProjectRelativeTypeScriptPath(value: string): boolean {
  if (isAbsolute(value) || value.includes('\\') || !value.endsWith('.ts')) {
    return false;
  }
  return value
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

const EnvironmentPathSchema = v.pipe(v.string(), v.check(isProjectRelativeTypeScriptPath));

const ConfigSchema = v.pipe(
  v.looseObject({ environmentPath: v.optional(v.unknown()) }),
  v.transform((raw): ConfigGateConfig | undefined => {
    if (raw.environmentPath === undefined) {
      return undefined;
    }
    const parsed = v.safeParse(EnvironmentPathSchema, raw.environmentPath);
    return parsed.success ? { environmentPath: parsed.output } : undefined;
  }),
);

export function parsePresetConfig(raw: object | undefined): ConfigGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(ConfigSchema, raw);
  return parsed.success ? parsed.output : undefined;
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const parsed = parsePresetConfig(config);
  if (parsed !== undefined) {
    applyConfiguredRule(rules, 'config/environment-boundaries', parsed);
  }
}

export function resolveManagedFileDestination(destination: string, config: object): string {
  const parsed = parsePresetConfig(config);
  if (destination === DEFAULT_ENVIRONMENT_PATH && parsed !== undefined) {
    return parsed.environmentPath;
  }
  return destination;
}

export type ConfigGateConfig = {
  environmentPath: string;
};
