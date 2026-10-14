import { defineRule, type Context, type ESTree } from '@oxlint/plugins';
import { posix } from 'node:path';
import * as v from 'valibot';

import { isUnderPathSegment, pathHasPrefix, projectPath } from './project-path.ts';

function staticModuleSpecifier(source: ESTree.Node | null): string | null {
  if (source == null) {
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
  if (node.type === 'ImportExpression') {
    return staticModuleSpecifier(node.source);
  }
  return null;
}

function moduleSpecifierNode(node: ESTree.Node): ESTree.Node | null {
  if (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportAllDeclaration' ||
    node.type === 'ExportNamedDeclaration'
  ) {
    return node.source;
  }
  if (node.type === 'ImportExpression') {
    return node.source;
  }
  return null;
}

function resolveProjectImport(importerRelativePath: string, source: string): string | null {
  if (source.startsWith('@/')) {
    return posix.normalize(source.slice(2));
  }
  if (!(source.startsWith('./') || source.startsWith('../'))) {
    return null;
  }
  const importerDir = posix.dirname(importerRelativePath);
  const resolved = posix.normalize(posix.join(importerDir, source));
  if (resolved === '..' || resolved.startsWith('../')) {
    return null;
  }
  return resolved === '.' ? '' : resolved;
}

const OptionsSchema = v.object({
  scriptDirectories: v.optional(v.array(v.string()), []),
});

function isScriptsPath(relativePath: string, scriptDirectories: readonly string[]): boolean {
  return scriptDirectories.some((directory) => pathHasPrefix(relativePath, `${directory}/`));
}

function reportScriptsImport(
  context: Context,
  node: ESTree.Node,
  relativePath: string,
  scriptDirectories: readonly string[],
): void {
  const source = moduleSpecifier(node);
  if (source == null) {
    return;
  }
  const resolved = resolveProjectImport(relativePath, source);
  if (resolved == null || !isScriptsPath(resolved, scriptDirectories)) {
    return;
  }
  const reportNode = moduleSpecifierNode(node);
  if (reportNode != null) {
    context.report({ node: reportNode, messageId: 'scriptsImport' });
  }
}

export const scriptsBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          scriptDirectories: { type: 'array', items: { type: 'string' } },
        },
      },
    ],
    messages: {
      scriptsImport:
        'Configured script directories are CLI-only; move shared parse helpers to production modules.',
    },
  },
  createOnce(context) {
    let relativePath = '';
    let scriptDirectories: readonly string[] = [];
    return {
      before() {
        relativePath = projectPath(context);
        scriptDirectories = v.parse(OptionsSchema, context.options[0] ?? {}).scriptDirectories;
        if (
          isScriptsPath(relativePath, scriptDirectories) ||
          isUnderPathSegment(relativePath, 'tests')
        ) {
          return false;
        }
        return undefined;
      },
      ImportDeclaration(node) {
        reportScriptsImport(context, node, relativePath, scriptDirectories);
      },
      ExportAllDeclaration(node) {
        reportScriptsImport(context, node, relativePath, scriptDirectories);
      },
      ExportNamedDeclaration(node) {
        reportScriptsImport(context, node, relativePath, scriptDirectories);
      },
      ImportExpression(node) {
        reportScriptsImport(context, node, relativePath, scriptDirectories);
      },
    };
  },
});
