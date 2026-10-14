import { isAbsolute } from 'node:path';

import * as v from 'valibot';

import { applyConfiguredRule } from 'agent-quality-gate/shared/oxlint';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

export const DEFAULT_DATABASE_DIRECTORY = 'system/database';

function isProjectRelativeDirectory(value: string): boolean {
  if (isAbsolute(value) || value.includes('\\')) {
    return false;
  }
  return value
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

const DatabaseDirectorySchema = v.pipe(v.string(), v.check(isProjectRelativeDirectory));

const ConfigSchema = v.pipe(
  v.looseObject({ databaseDirectory: v.optional(v.unknown()) }),
  v.transform((raw): DatabaseSqliteGateConfig | undefined => {
    if (raw.databaseDirectory === undefined) {
      return undefined;
    }
    const parsed = v.safeParse(DatabaseDirectorySchema, raw.databaseDirectory);
    return parsed.success ? { databaseDirectory: parsed.output } : undefined;
  }),
);

export function parsePresetConfig(raw: object | undefined): DatabaseSqliteGateConfig | undefined {
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
    applyConfiguredRule(rules, 'database-sqlite/boundaries', parsed);
    applyConfiguredRule(rules, 'database-sqlite/test-boundaries', parsed);
  }
}

export function resolveManagedFileDestination(destination: string, config: object): string {
  const parsed = parsePresetConfig(config);
  const prefix = `${DEFAULT_DATABASE_DIRECTORY}/`;
  if (destination.startsWith(prefix) && parsed !== undefined) {
    return `${parsed.databaseDirectory}/${destination.slice(prefix.length)}`;
  }
  return destination;
}

export type DatabaseSqliteGateConfig = {
  databaseDirectory: string;
};
