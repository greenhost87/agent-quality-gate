import {
  definePlugin,
  defineRule,
  eslintCompatPlugin,
  type ESTree,
  type Options,
} from '@oxlint/plugins';
import * as v from 'valibot';

import { createOptionsRefCache } from '../../../scripts/oxlint-options-ref-cache/options-ref-cache.ts';

import { projectPath } from './project-path.ts';

const validTestsTreePlacement = /^tests\/(?:[^/]+\/)*[^/]+\.tsx?$/u;
const validConcern = /^[a-z][a-z0-9-]*$/u;

const ModulePlacementOptionsSchema = v.object({
  directories: v.optional(v.array(v.string()), []),
  rootExceptions: v.optional(v.record(v.string(), v.array(v.string())), {}),
  forbidConcernPrefix: v.optional(v.array(v.string()), []),
  maxDepth: v.optional(v.record(v.string(), v.number()), {}),
});

function readOptions(options: Readonly<Options>): ParsedOptions {
  const parsed = v.safeParse(ModulePlacementOptionsSchema, options[0]);
  if (!parsed.success) {
    return {
      directories: [],
      rootExceptions: new Map(),
      forbidConcernPrefix: new Set(),
      maxDepth: new Map(),
    };
  }
  const rootExceptions = new Map<string, Set<string>>();
  for (const [directory, exceptions] of Object.entries(parsed.output.rootExceptions)) {
    rootExceptions.set(directory, new Set(exceptions));
  }
  return {
    directories: parsed.output.directories,
    rootExceptions,
    forbidConcernPrefix: new Set(parsed.output.forbidConcernPrefix),
    maxDepth: new Map(Object.entries(parsed.output.maxDepth)),
  };
}

function directoryPrefix(directory: string): string {
  return directory.endsWith('/') ? directory : `${directory}/`;
}

function watchedRelativePath(relativePath: string, directory: string): string | null {
  if (relativePath === directory) {
    return null;
  }
  const prefix = directoryPrefix(directory);
  if (!relativePath.startsWith(prefix)) {
    return null;
  }
  return relativePath.slice(prefix.length);
}

function longestWatchedRelativePath(
  relativePath: string,
  directories: readonly string[],
): WatchedMatch | null {
  let bestMatch: WatchedMatch | null = null;
  for (const directory of directories) {
    const watchedRelative = watchedRelativePath(relativePath, directory);
    if (watchedRelative === null) {
      continue;
    }
    if (bestMatch === null || directory.length > bestMatch.directory.length) {
      bestMatch = { directory, watchedRelative };
    }
  }
  return bestMatch;
}

function isValidPlacement(
  watchedRelative: string,
  directory: string,
  rootExceptions: ReadonlyMap<string, ReadonlySet<string>>,
  maxDepth: ReadonlyMap<string, number>,
): boolean {
  if (!/\.tsx?$/u.test(watchedRelative)) {
    return true;
  }
  const exceptions = rootExceptions.get(directory) ?? new Set<string>();
  if (!watchedRelative.includes('/')) {
    return exceptions.has(watchedRelative);
  }
  if (validTestsTreePlacement.test(watchedRelative)) {
    return true;
  }
  const segments = watchedRelative.split('/');
  segments.pop();
  const testsIndex = segments.indexOf('tests');
  const concernSegments = testsIndex === -1 ? segments : segments.slice(0, testsIndex);
  if (testsIndex !== -1 && testsIndex !== segments.length - 1) {
    return false;
  }
  const configuredMaxDepth = maxDepth.get(directory) ?? 1;
  return (
    concernSegments.length > 0 &&
    concernSegments.length <= configuredMaxDepth &&
    concernSegments.every((segment) => validConcern.test(segment))
  );
}

function stripConcernBasename(fileName: string): string {
  const withoutViewTest = fileName.replace(/\.view\.test\.tsx?$/u, '');
  if (withoutViewTest !== fileName) {
    return withoutViewTest;
  }
  const withoutView = fileName.replace(/\.view\.tsx?$/u, '');
  if (withoutView !== fileName) {
    return withoutView;
  }
  return fileName.replace(/\.tsx?$/u, '');
}

function redundantConcernPrefixViolation(
  watchedRelative: string,
  directory: string,
  forbidConcernPrefix: ReadonlySet<string>,
): { concern: string; fileName: string } | null {
  if (!forbidConcernPrefix.has(directory) || !/\.tsx?$/u.test(watchedRelative)) {
    return null;
  }
  const segments = watchedRelative.split('/');
  const fileName = segments.pop();
  if (fileName === undefined || segments.length === 0) {
    return null;
  }
  const basename = stripConcernBasename(fileName);
  if (basename === 'index') {
    return null;
  }
  for (const concern of segments) {
    if (concern !== 'tests' && basename !== concern && basename.startsWith(concern)) {
      return { concern, fileName };
    }
  }
  return null;
}

export const modulePlacement = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          directories: {
            type: 'array',
            items: { type: 'string' },
          },
          rootExceptions: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          forbidConcernPrefix: {
            type: 'array',
            items: { type: 'string' },
          },
          maxDepth: {
            type: 'object',
            additionalProperties: { type: 'number', minimum: 1 },
          },
        },
      },
    ],
    messages: {
      placement:
        'Production modules under {{directory}} must use 1 to {{maxDepth}} concern directory segments.',
      redundantPrefix:
        'Module "{{fileName}}" repeats the "{{concern}}/" path context; use a basename without that prefix. Exact mirrored concern/module names remain valid.',
    },
  },
  createOnce(context) {
    const optionsCache = createOptionsRefCache(readOptions);
    let options: ParsedOptions = {
      directories: [],
      rootExceptions: new Map(),
      forbidConcernPrefix: new Set(),
      maxDepth: new Map(),
    };

    function checkProgram(node: ESTree.Program): void {
      const { directories, rootExceptions, forbidConcernPrefix, maxDepth } = options;
      const relativePath = projectPath(context);
      const match = longestWatchedRelativePath(relativePath, directories);
      if (match === null) {
        return;
      }
      if (!isValidPlacement(match.watchedRelative, match.directory, rootExceptions, maxDepth)) {
        context.report({
          node,
          messageId: 'placement',
          data: {
            directory: match.directory,
            maxDepth: maxDepth.get(match.directory) ?? 1,
          },
        });
      }
      const redundantPrefix = redundantConcernPrefixViolation(
        match.watchedRelative,
        match.directory,
        forbidConcernPrefix,
      );
      if (redundantPrefix !== null) {
        context.report({
          node,
          messageId: 'redundantPrefix',
          data: redundantPrefix,
        });
      }
    }

    return {
      before() {
        options = optionsCache.get(context.options);
        if (options.directories.length === 0) {
          return false;
        }
        return undefined;
      },
      Program(node) {
        checkProgram(node);
      },
    };
  },
});

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'module-placement',
    },
    rules: {
      'module-placement': modulePlacement,
    },
  }),
);

export type ParsedOptions = {
  directories: string[];
  rootExceptions: Map<string, Set<string>>;
  forbidConcernPrefix: Set<string>;
  maxDepth: Map<string, number>;
};

export type WatchedMatch = {
  directory: string;
  watchedRelative: string;
};
