import * as v from 'valibot';

import { applyConfiguredRule } from '../../preset-catalog/oxlint-config/apply-configured-rule.ts';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.ts';

const StringArraySchema = v.pipe(
  v.array(v.unknown()),
  v.transform((items) => items.filter((item): item is string => typeof item === 'string')),
);

function isProjectRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('..');
}

const DirectoryListSchema = v.pipe(
  v.optional(v.array(v.unknown()), []),
  v.transform((directories) =>
    directories
      .filter((directory): directory is string => typeof directory === 'string')
      .filter(isProjectRelativePath)
      .map((directory) => directory.replace(/\/+$/u, '')),
  ),
);

function parseDirectoryLimits(raw: object, directories: readonly string[]): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const [directory, limit] of Object.entries(raw)) {
    const normalized = directory.replace(/\/+$/u, '');
    if (
      directories.includes(normalized) &&
      typeof limit === 'number' &&
      Number.isSafeInteger(limit) &&
      limit > 0
    ) {
      limits[normalized] = limit;
    }
  }
  return limits;
}

const ModulePlacementSchema = v.pipe(
  v.looseObject({
    directories: v.optional(v.array(v.unknown())),
    rootExceptions: v.optional(v.record(v.string(), v.array(v.unknown()))),
    forbidConcernPrefix: v.optional(v.array(v.unknown())),
    maxDepth: v.optional(v.record(v.string(), v.unknown())),
    maxFilesPerDirectory: v.optional(v.record(v.string(), v.unknown())),
    routeCompositionRoots: v.optional(v.record(v.string(), v.unknown())),
  }),
  v.transform((raw): ModulePlacementGateConfig | undefined => {
    const directories = v.parse(DirectoryListSchema, raw.directories);
    if (directories.length === 0) {
      return undefined;
    }
    const rootExceptions: Record<string, string[]> = {};
    for (const [directory, exceptions] of Object.entries(raw.rootExceptions ?? {})) {
      const normalized = directory.replace(/\/+$/u, '');
      if (!directories.includes(normalized)) {
        continue;
      }
      const parsed = v.safeParse(StringArraySchema, exceptions);
      if (parsed.success && parsed.output.length > 0) {
        rootExceptions[normalized] = parsed.output;
      }
    }
    const forbidConcernPrefix = v
      .parse(DirectoryListSchema, raw.forbidConcernPrefix)
      .filter((directory) => directories.includes(directory));
    const maxDepth = parseDirectoryLimits(raw.maxDepth ?? {}, directories);
    const maxFilesPerDirectory = parseDirectoryLimits(raw.maxFilesPerDirectory ?? {}, directories);
    const routeCompositionRoots: Record<string, RouteCompositionRootConfig> = {};
    for (const [directory, value] of Object.entries(raw.routeCompositionRoots ?? {})) {
      const normalized = directory.replace(/\/+$/u, '');
      const parsed = v.safeParse(
        v.looseObject({ manifest: v.unknown(), presentationRoot: v.unknown() }),
        value,
      );
      if (
        !directories.includes(normalized) ||
        !parsed.success ||
        typeof parsed.output.manifest !== 'string' ||
        !isProjectRelativePath(parsed.output.manifest) ||
        typeof parsed.output.presentationRoot !== 'string' ||
        !isProjectRelativePath(parsed.output.presentationRoot)
      ) {
        continue;
      }
      routeCompositionRoots[normalized] = {
        manifest: parsed.output.manifest,
        presentationRoot: parsed.output.presentationRoot.replace(/\/+$/u, ''),
      };
    }
    return {
      directories,
      rootExceptions,
      forbidConcernPrefix,
      maxDepth,
      maxFilesPerDirectory,
      routeCompositionRoots,
    };
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
    forbidConcernPrefix: [...placement.forbidConcernPrefix],
    maxDepth: { ...placement.maxDepth },
  });
}

export type ModulePlacementGateConfig = {
  directories: string[];
  rootExceptions: Record<string, string[]>;
  forbidConcernPrefix: string[];
  maxDepth: Record<string, number>;
  maxFilesPerDirectory: Record<string, number>;
  routeCompositionRoots: Record<string, RouteCompositionRootConfig>;
};

export type RouteCompositionRootConfig = {
  manifest: string;
  presentationRoot: string;
};
