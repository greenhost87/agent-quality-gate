import {
  definePlugin,
  defineRule,
  eslintCompatPlugin,
  type ESTree,
  type Options,
} from '@oxlint/plugins';
import * as v from 'valibot';

import { createOptionsRefCache } from 'agent-quality-gate/shared/oxlint';

import { projectPath } from './project-path.ts';
export type ParsedOptions = {
  allowedRootModules: ReadonlySet<string>;
  alwaysAllowedDependencies: ReadonlySet<string>;
  compositionDirectories: ReadonlySet<string>;
  declaredDependencies: ReadonlyMap<string, ReadonlySet<string>>;
  nonProductionDirectories: ReadonlySet<string>;
  privatePackages: ReadonlySet<string>;
  testDirectories: ReadonlySet<string>;
  testImportablePrivatePackages: ReadonlySet<string>;
};

const PackageBoundariesOptionsSchema = v.object({
  allowedRootModules: v.optional(v.array(v.string()), []),
  alwaysAllowedDependencies: v.optional(v.array(v.string()), []),
  compositionDirectories: v.optional(v.array(v.string()), []),
  declaredDependencies: v.optional(v.record(v.string(), v.array(v.string())), {}),
  nonProductionDirectories: v.optional(v.array(v.string()), []),
  privatePackages: v.optional(v.array(v.string()), []),
  testDirectories: v.optional(v.array(v.string()), []),
  testImportablePrivatePackages: v.optional(v.array(v.string()), []),
});

function packageName(
  path: string,
  compositionDirectories: ReadonlySet<string>,
  nonProductionDirectories: ReadonlySet<string>,
): string | null {
  const segments = path.split('/');
  if (segments.length < 2) return null;
  const topLevel = segments[0];
  if (compositionDirectories.has(topLevel) || nonProductionDirectories.has(topLevel)) return null;
  return topLevel;
}

function importedPackage(
  source: string,
  compositionDirectories: ReadonlySet<string>,
  nonProductionDirectories: ReadonlySet<string>,
): string | null {
  if (!source.startsWith('@/')) return null;
  const topLevel = importedTopLevelSegment(source);
  if (topLevel === null) return null;
  if (compositionDirectories.has(topLevel) || nonProductionDirectories.has(topLevel)) return null;
  return topLevel;
}

function importedTopLevelSegment(source: string): string | null {
  if (!source.startsWith('@/')) return null;
  const importedPath = source.slice(2);
  if (!importedPath.includes('/')) return null;
  return importedPath.split('/')[0] ?? null;
}

function resolveRelativeImport(importerDir: string, source: string): string {
  const segments = importerDir.length === 0 ? [] : importerDir.split('/');
  for (const part of source.split('/')) {
    if (part === '.' || part.length === 0) {
      continue;
    }
    if (part === '..') {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join('/');
}

function resolveProjectImport(importerPath: string, source: string): string | null {
  if (source.startsWith('@/')) {
    return source.slice(2);
  }
  if (!source.startsWith('.')) {
    return null;
  }
  const importerDir = importerPath.includes('/')
    ? importerPath.slice(0, importerPath.lastIndexOf('/'))
    : '';
  const resolved = resolveRelativeImport(importerDir, source);
  if (resolved === '..' || resolved.startsWith('../')) {
    return null;
  }
  return resolved;
}

function isUnderDirectory(path: string, directories: ReadonlySet<string>): boolean {
  for (const directory of directories) {
    if (path === directory || path.startsWith(`${directory}/`)) {
      return true;
    }
  }
  return false;
}

function importedPrivatePackage(
  source: string,
  importerPath: string,
  privatePackages: ReadonlySet<string>,
): string | null {
  if (privatePackages.size === 0 || source.includes(':')) {
    return null;
  }
  const aliasTopLevel = importedTopLevelSegment(source);
  if (aliasTopLevel !== null && privatePackages.has(aliasTopLevel)) {
    return aliasTopLevel;
  }
  if (source.startsWith('.')) {
    const resolved = resolveProjectImport(importerPath, source);
    const topLevel = resolved?.split('/')[0] ?? '';
    if (topLevel.length > 0 && privatePackages.has(topLevel)) {
      return topLevel;
    }
  }
  return null;
}

function importsFromPrivatePackage(
  importerPath: string,
  dependency: string,
  options: ParsedOptions,
): boolean {
  if (
    isUnderDirectory(importerPath, options.testDirectories) &&
    options.testImportablePrivatePackages.has(dependency)
  ) {
    return false;
  }
  const importerPackage = packageName(
    importerPath,
    options.compositionDirectories,
    options.nonProductionDirectories,
  );
  if (importerPackage === dependency) {
    return false;
  }
  if (importerPath === dependency || importerPath.startsWith(`${dependency}/`)) {
    return false;
  }
  return options.privatePackages.has(dependency);
}

function readOptions(options: Readonly<Options>): ParsedOptions {
  const parsed = v.safeParse(PackageBoundariesOptionsSchema, options[0]);
  if (!parsed.success) {
    return {
      allowedRootModules: new Set(),
      alwaysAllowedDependencies: new Set(),
      compositionDirectories: new Set(),
      declaredDependencies: new Map(),
      nonProductionDirectories: new Set(),
      privatePackages: new Set(),
      testDirectories: new Set(),
      testImportablePrivatePackages: new Set(),
    };
  }
  const allowedRootModules = new Set(parsed.output.allowedRootModules);
  const declaredDependencies = new Map<string, Set<string>>();
  for (const [owner, dependencies] of Object.entries(parsed.output.declaredDependencies)) {
    declaredDependencies.set(owner, new Set(dependencies));
  }
  return {
    allowedRootModules,
    alwaysAllowedDependencies: new Set(parsed.output.alwaysAllowedDependencies),
    compositionDirectories: new Set(parsed.output.compositionDirectories),
    declaredDependencies,
    nonProductionDirectories: new Set(parsed.output.nonProductionDirectories),
    privatePackages: new Set(parsed.output.privatePackages),
    testDirectories: new Set(parsed.output.testDirectories),
    testImportablePrivatePackages: new Set(parsed.output.testImportablePrivatePackages),
  };
}

function allowsDependency(owner: string, dependency: string, options: ParsedOptions): boolean {
  return (
    owner === dependency ||
    options.alwaysAllowedDependencies.has(dependency) ||
    options.declaredDependencies.get(owner)?.has(dependency) === true
  );
}

function staticModuleSpecifier(source: ESTree.Node | null): string | null {
  if (source === null) {
    return null;
  }
  if (source.type === 'Literal' && typeof source.value === 'string') {
    return source.value;
  }
  return null;
}

function moduleSpecifier(node: ESTree.Node): string | null {
  if (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportAllDeclaration' ||
    node.type === 'ExportNamedDeclaration'
  ) {
    return staticModuleSpecifier(node.source ?? null);
  }
  return null;
}

function moduleSpecifierNode(node: ESTree.Node): ESTree.Node | null {
  if (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportAllDeclaration' ||
    node.type === 'ExportNamedDeclaration'
  ) {
    return node.source ?? null;
  }
  return null;
}

export const packageBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowedRootModules: {
            type: 'array',
            items: { type: 'string' },
          },
          alwaysAllowedDependencies: {
            type: 'array',
            items: { type: 'string' },
          },
          compositionDirectories: {
            type: 'array',
            items: { type: 'string' },
          },
          declaredDependencies: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          nonProductionDirectories: {
            type: 'array',
            items: { type: 'string' },
          },
          privatePackages: {
            type: 'array',
            items: { type: 'string' },
          },
          testDirectories: {
            type: 'array',
            items: { type: 'string' },
          },
          testImportablePrivatePackages: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    ],
    messages: {
      dependency: 'Package "{{owner}}" must not import package "{{dependency}}".',
      placement: 'Place production modules in a named package instead of the project root.',
      privatePackage:
        'Package "{{dependency}}" is private; import it only from inside that package.',
      testsImport: 'Production modules must not import test modules under tests/.',
    },
  },
  createOnce(context) {
    const optionsCache = createOptionsRefCache(readOptions);

    function inspectModuleEdge(
      node: ESTree.Node,
      importerPath: string,
      owner: string | null,
      options: ParsedOptions,
    ): void {
      const source = moduleSpecifier(node);
      const sourceNode = moduleSpecifierNode(node);
      if (source === null || sourceNode === null) {
        return;
      }

      if (!isUnderDirectory(importerPath, options.testDirectories)) {
        const resolved = resolveProjectImport(importerPath, source);
        if (resolved !== null && isUnderDirectory(resolved, options.testDirectories)) {
          context.report({
            node: sourceNode,
            messageId: 'testsImport',
          });
          return;
        }
      }

      const privateDependency = importedPrivatePackage(
        source,
        importerPath,
        options.privatePackages,
      );
      if (
        privateDependency !== null &&
        importsFromPrivatePackage(importerPath, privateDependency, options)
      ) {
        context.report({
          node: sourceNode,
          messageId: 'privatePackage',
          data: { dependency: privateDependency },
        });
        return;
      }
      if (!owner) {
        return;
      }
      const dependency = importedPackage(
        source,
        options.compositionDirectories,
        options.nonProductionDirectories,
      );
      if (dependency && !allowsDependency(owner, dependency, options)) {
        context.report({
          node: sourceNode,
          messageId: 'dependency',
          data: { dependency, owner },
        });
      }
    }

    return {
      before() {
        const path = projectPath(context);
        const options = optionsCache.get(context.options);
        const owner = packageName(
          path,
          options.compositionDirectories,
          options.nonProductionDirectories,
        );
        const isInvalidRootModule =
          !path.includes('/') &&
          /\.[cm]?[jt]sx?$/u.test(path) &&
          !options.allowedRootModules.has(path);
        const program = context.sourceCode.ast;
        if (isInvalidRootModule) {
          context.report({ node: program, messageId: 'placement' });
        }
        for (const statement of program.body) {
          if (
            statement.type === 'ImportDeclaration' ||
            statement.type === 'ExportAllDeclaration' ||
            statement.type === 'ExportNamedDeclaration'
          ) {
            inspectModuleEdge(statement, path, owner, options);
          }
        }
        return false;
      },
      Program() {},
    };
  },
});

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'packages',
    },
    rules: {
      'package-boundaries': packageBoundaries,
    },
  }),
);
