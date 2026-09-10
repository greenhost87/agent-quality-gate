import * as v from 'valibot';

import { StringArraySchema } from './string-array-schema.ts';

export type RouteCompositionRootConfig = {
  manifest: string;
  presentationRoot: string;
};

export type ModulePlacementGateConfig = {
  directories: string[];
  rootExceptions: Record<string, string[]>;
  forbidConcernPrefix: string[];
  maxDepth: Record<string, number>;
  maxFilesPerDirectory: Record<string, number>;
  routeCompositionRoots: Record<string, RouteCompositionRootConfig>;
};

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

function parseRootExceptions(
  raw: object,
  directories: readonly string[],
): Record<string, string[]> {
  const rootExceptions: Record<string, string[]> = {};
  for (const [directory, exceptions] of Object.entries(raw)) {
    const normalized = directory.replace(/\/+$/u, '');
    if (!directories.includes(normalized)) {
      continue;
    }
    const exceptionsParsed = v.safeParse(StringArraySchema, exceptions);
    if (exceptionsParsed.success && exceptionsParsed.output.length > 0) {
      rootExceptions[normalized] = exceptionsParsed.output;
    }
  }
  return rootExceptions;
}

function parseRouteCompositionRoots(
  raw: object,
  directories: readonly string[],
): Record<string, RouteCompositionRootConfig> {
  const routeCompositionRoots: Record<string, RouteCompositionRootConfig> = {};
  for (const [directory, value] of Object.entries(raw)) {
    const normalized = directory.replace(/\/+$/u, '');
    const routeParsed = v.safeParse(
      v.looseObject({ manifest: v.unknown(), presentationRoot: v.unknown() }),
      value,
    );
    if (
      !directories.includes(normalized) ||
      !routeParsed.success ||
      typeof routeParsed.output.manifest !== 'string' ||
      !isProjectRelativePath(routeParsed.output.manifest) ||
      typeof routeParsed.output.presentationRoot !== 'string' ||
      !isProjectRelativePath(routeParsed.output.presentationRoot)
    ) {
      continue;
    }
    routeCompositionRoots[normalized] = {
      manifest: routeParsed.output.manifest,
      presentationRoot: routeParsed.output.presentationRoot.replace(/\/+$/u, ''),
    };
  }
  return routeCompositionRoots;
}

export function parsePlacement(raw: object | undefined): ModulePlacementGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(
    v.looseObject({
      directories: v.optional(v.array(v.unknown())),
      rootExceptions: v.optional(v.record(v.string(), v.array(v.unknown()))),
      forbidConcernPrefix: v.optional(v.array(v.unknown())),
      maxDepth: v.optional(v.record(v.string(), v.unknown())),
      maxFilesPerDirectory: v.optional(v.record(v.string(), v.unknown())),
      routeCompositionRoots: v.optional(v.record(v.string(), v.unknown())),
    }),
    raw,
  );
  if (!parsed.success) {
    return undefined;
  }
  const directories = v.parse(DirectoryListSchema, parsed.output.directories);
  if (directories.length === 0) {
    return undefined;
  }
  return {
    directories,
    rootExceptions: parseRootExceptions(parsed.output.rootExceptions ?? {}, directories),
    forbidConcernPrefix: v
      .parse(DirectoryListSchema, parsed.output.forbidConcernPrefix)
      .filter((directory) => directories.includes(directory)),
    maxDepth: parseDirectoryLimits(parsed.output.maxDepth ?? {}, directories),
    maxFilesPerDirectory: parseDirectoryLimits(
      parsed.output.maxFilesPerDirectory ?? {},
      directories,
    ),
    routeCompositionRoots: parseRouteCompositionRoots(
      parsed.output.routeCompositionRoots ?? {},
      directories,
    ),
  };
}
