import { defineRule, type Context, type ESTree } from '@oxlint/plugins';
import { posix } from 'node:path';

import { walkAstSkippingTypeAndJsxMarkup } from '../../../scripts/oxlint-walk/oxlint-walk.ts';
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

function isScriptsPath(relativePath: string): boolean {
  return pathHasPrefix(relativePath, 'scripts/');
}

function reportScriptsImport(context: Context, node: ESTree.Node, relativePath: string): void {
  const source = moduleSpecifier(node);
  if (source == null) {
    return;
  }
  const resolved = resolveProjectImport(relativePath, source);
  if (resolved == null || !isScriptsPath(resolved)) {
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
    schema: [],
    messages: {
      scriptsImport: 'scripts/ is CLI-only; move shared parse helpers to production modules.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const relativePath = projectPath(context);
        if (isScriptsPath(relativePath) || isUnderPathSegment(relativePath, 'tests')) {
          return false;
        }
        const program = context.sourceCode.ast;
        for (const statement of program.body) {
          if (
            statement.type === 'ImportDeclaration' ||
            statement.type === 'ExportAllDeclaration' ||
            statement.type === 'ExportNamedDeclaration'
          ) {
            reportScriptsImport(context, statement, relativePath);
          }
        }
        if (context.sourceCode.text.includes('import(')) {
          walkAstSkippingTypeAndJsxMarkup(program, (node) => {
            if (node.type === 'ImportExpression') {
              reportScriptsImport(context, node, relativePath);
            }
          });
        }
        return false;
      },
      Program() {},
    };
  },
});
