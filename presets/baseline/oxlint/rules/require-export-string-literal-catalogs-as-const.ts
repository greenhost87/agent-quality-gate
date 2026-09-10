import { defineRule, type ESTree } from '@oxlint/plugins';

import { isReadonlyStringLiteralCatalog, isStaticString } from '../ast.ts';

function arrayExpression(node: ESTree.Node | null): ESTree.ArrayExpression | null {
  let expression: ESTree.Node | null = node;
  while (
    expression?.type === 'TSAsExpression' ||
    expression?.type === 'TSSatisfiesExpression' ||
    expression?.type === 'TSTypeAssertion'
  ) {
    expression = expression.expression;
  }
  return expression?.type === 'ArrayExpression' ? expression : null;
}

function isStringLiteralCatalog(node: ESTree.Node | null): boolean {
  const array = arrayExpression(node);
  return (
    array !== null &&
    array.elements.length > 0 &&
    array.elements.every((element) => isStaticString(element))
  );
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      invalid:
        'Export string literal catalogs as an unannotated readonly tuple using "as const", then derive the union with "(typeof values)[number]". For membership against a string, use .some((value) => value === candidate) or a Set derived from the catalog - not .includes(candidate).',
    },
  },
  createOnce(context) {
    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
          return;
        }
        for (const item of declaration.declarations) {
          if (
            item.id.type === 'Identifier' &&
            item.init &&
            isStringLiteralCatalog(item.init) &&
            (item.id.typeAnnotation != null || !isReadonlyStringLiteralCatalog(item.init))
          ) {
            context.report({ node: item.id, messageId: 'invalid' });
          }
        }
      },
    };
  },
});
