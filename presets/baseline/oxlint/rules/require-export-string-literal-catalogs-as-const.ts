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

function checkDeclarator(
  context: { report: (diagnostic: { node: ESTree.Node; messageId: string }) => void },
  node: ESTree.VariableDeclarator,
  declaration: ESTree.VariableDeclaration,
): void {
  if (
    declaration.kind === 'const' &&
    declaration.parent.type === 'ExportNamedDeclaration' &&
    node.id.type === 'Identifier' &&
    node.init &&
    isStringLiteralCatalog(node.init) &&
    (node.id.typeAnnotation != null || !isReadonlyStringLiteralCatalog(node.init))
  ) {
    context.report({ node: node.id, messageId: 'invalid' });
  }
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
    function checkProgram(program: ESTree.Program): void {
      for (const statement of program.body) {
        if (statement.type !== 'ExportNamedDeclaration') {
          continue;
        }
        const declaration = statement.declaration;
        if (declaration?.type !== 'VariableDeclaration') {
          continue;
        }
        declaration.parent = statement;
        for (const item of declaration.declarations) {
          checkDeclarator(context, item, declaration);
        }
      }
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
