import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import { calleeExportName, collectValibotBindings } from './valibot-bindings.ts';
import type { ValibotBindings } from './valibot-bindings.types.ts';
import { walkAst } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

const TRIVIAL_LEAVES = new Set(['string', 'number', 'boolean', 'null', 'undefined']);
const TRIVIAL_WRAPPERS = new Set(['array', 'optional', 'nullable']);

function isTrivialValibotSchema(node: ESTree.Node, bindings: ValibotBindings): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const name = calleeExportName(node.callee, bindings);
  if (name === null) {
    return false;
  }
  if (TRIVIAL_LEAVES.has(name)) {
    return true;
  }
  if (!TRIVIAL_WRAPPERS.has(name)) {
    return false;
  }
  if (node.arguments.length === 0) {
    return false;
  }
  return isTrivialValibotSchema(node.arguments[0], bindings);
}

function exportedConstDeclarators(
  node: ESTree.ExportNamedDeclaration,
): readonly ESTree.VariableDeclarator[] {
  if (node.declaration?.type !== 'VariableDeclaration' || node.declaration.kind !== 'const') {
    return [];
  }
  return node.declaration.declarations;
}

function reportTrivialAlias(
  context: Context,
  declarator: ESTree.VariableDeclarator,
  bindings: ValibotBindings,
): void {
  if (declarator.id.type !== 'Identifier' || declarator.init == null) {
    return;
  }
  if (!isTrivialValibotSchema(declarator.init, bindings)) {
    return;
  }
  context.report({
    node: declarator.id,
    messageId: 'trivialAlias',
    data: { name: declarator.id.name },
  });
}

export const noTrivialValibotSchemaAlias = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      trivialAlias:
        'Do not export trivial valibot schema alias "{{name}}". Inline v.string() / v.array(v.string()) at the use site.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const bindings = collectValibotBindings(context.sourceCode.ast);
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type !== 'ExportNamedDeclaration') {
            return;
          }
          for (const declarator of exportedConstDeclarators(node)) {
            reportTrivialAlias(context, declarator, bindings);
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
