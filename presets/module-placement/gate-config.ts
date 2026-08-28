import * as v from 'valibot';

import { applyConfiguredRule } from '../../preset-catalog/oxlint-config/apply-configured-rule.ts';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.ts';

const StringArraySchema = v.pipe(
  v.array(v.unknown()),
  v.transform((items) => items.filter((item): item is string => typeof item === 'string')),
);

function normalizeModulePlacementDirectory(directory: string): string {
  return directory.replace(/\/+$/u, '');
}

function isProjectRelativeDirectory(directory: string): boolean {
  return directory.length > 0 && !directory.startsWith('/') && !directory.includes('..');
}

const ModulePlacementSchema = v.pipe(
  v.looseObject({
    directories: v.optional(v.array(v.unknown())),
    rootExceptions: v.optional(v.record(v.string(), v.array(v.unknown()))),
  }),
  v.transform((raw): ModulePlacementGateConfig | undefined => {
    const directories: string[] = [];
    for (const directory of raw.directories ?? []) {
      if (typeof directory === 'string' && isProjectRelativeDirectory(directory)) {
        directories.push(normalizeModulePlacementDirectory(directory));
      }
    }
    if (directories.length === 0) {
      return undefined;
    }
    const rootExceptions: Record<string, string[]> = {};
    for (const [directory, exceptions] of Object.entries(raw.rootExceptions ?? {})) {
      if (!isProjectRelativeDirectory(directory)) {
        continue;
      }
      const normalized = normalizeModulePlacementDirectory(directory);
      if (!directories.includes(normalized)) {
        continue;
      }
      const parsed = v.safeParse(StringArraySchema, exceptions);
      if (parsed.success && parsed.output.length > 0) {
        rootExceptions[normalized] = parsed.output;
      }
    }
    return { directories, rootExceptions };
  }),
);

export function parsePresetConfig(raw: object | undefined): ModulePlacementGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(ModulePlacementSchema, raw);
  return parsed.success ? parsed.output : undefined;
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const placement = parsePresetConfig(config);
  if (placement === undefined) {
    return;
  }
  applyConfiguredRule(rules, 'module-placement/module-placement', {
    directories: [...placement.directories],
    rootExceptions: Object.fromEntries(
      Object.entries(placement.rootExceptions).map(([directory, exceptions]) => [
        directory,
        [...exceptions],
      ]),
    ),
  });
}

export type ModulePlacementGateConfig = {
  directories: string[];
  rootExceptions: Record<string, string[]>;
};
