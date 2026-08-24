import {
  definePlugin,
  defineRule,
  eslintCompatPlugin,
  type Context,
  type ESTree,
  type Options,
} from '@oxlint/plugins';
import * as v from 'valibot';

import type { ParsedOptions, WatchedMatch } from './module-placement.types.ts';

const validNestedPlacement = /^[a-z][a-z0-9-]*(?:\/tests)?\/[^/]+\.tsx?$/u;

const ModulePlacementOptionsSchema = v.object({
  directories: v.optional(v.array(v.string()), []),
  rootExceptions: v.optional(v.record(v.string(), v.array(v.string())), {}),
});

function normalizedFilename(context: Context): string {
  return context.filename.replaceAll('\\', '/');
}

function projectPath(context: Context): string {
  const root = context.cwd.replaceAll('\\', '/');
  const filename = normalizedFilename(context);
  return filename.startsWith(`${root}/`) ? filename.slice(root.length + 1) : filename;
}

function readOptions(options: Readonly<Options>): ParsedOptions {
  const parsed = v.safeParse(ModulePlacementOptionsSchema, options[0]);
  if (!parsed.success) {
    return { directories: [], rootExceptions: new Map() };
  }
  const rootExceptions = new Map<string, Set<string>>();
  for (const [directory, exceptions] of Object.entries(parsed.output.rootExceptions)) {
    rootExceptions.set(directory, new Set(exceptions));
  }
  return { directories: parsed.output.directories, rootExceptions };
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
): boolean {
  if (!/\.tsx?$/u.test(watchedRelative)) {
    return true;
  }
  const exceptions = rootExceptions.get(directory) ?? new Set<string>();
  if (!watchedRelative.includes('/')) {
    return exceptions.has(watchedRelative);
  }
  return validNestedPlacement.test(watchedRelative);
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
        },
      },
    ],
    messages: {
      placement:
        'Production modules must live in {{directory}}/<concern>/, not directly under {{directory}}/.',
    },
  },
  createOnce(context) {
    function checkProgram(node: ESTree.Program): void {
      const { directories, rootExceptions } = readOptions(context.options);
      if (directories.length === 0) {
        return;
      }
      const relativePath = projectPath(context);
      const match = longestWatchedRelativePath(relativePath, directories);
      if (match === null) {
        return;
      }
      if (isValidPlacement(match.watchedRelative, match.directory, rootExceptions)) {
        return;
      }
      context.report({
        node,
        messageId: 'placement',
        data: { directory: match.directory },
      });
    }

    return {
      before() {
        checkProgram(context.sourceCode.ast);
        return false;
      },
      Program() {},
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
