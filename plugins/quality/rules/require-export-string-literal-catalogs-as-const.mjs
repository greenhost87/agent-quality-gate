import { isReadonlyStringLiteralCatalog, isStaticString } from '../ast.mjs';

function arrayExpression(node) {
  let expression = node;
  while (
    expression?.type === 'TSAsExpression' ||
    expression?.type === 'TSSatisfiesExpression' ||
    expression?.type === 'TSTypeAssertion'
  ) {
    expression = expression.expression;
  }
  return expression?.type === 'ArrayExpression' ? expression : null;
}

function isStringLiteralCatalog(node) {
  const array = arrayExpression(node);
  return (
    array !== null &&
    array.elements.length > 0 &&
    array.elements.every(isStaticString)
  );
}

const requireExportStringLiteralCatalogsAsConst = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      invalid:
        'Export string literal catalogs as an unannotated readonly tuple using "as const", then derive the union with "(typeof values)[number]".',
    },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        const declaration = node.parent;
        if (
          declaration.type === 'VariableDeclaration' &&
          declaration.kind === 'const' &&
          declaration.parent.type === 'ExportNamedDeclaration' &&
          node.id.type === 'Identifier' &&
          node.init &&
          isStringLiteralCatalog(node.init) &&
          (node.id.typeAnnotation != null || !isReadonlyStringLiteralCatalog(node.init))
        ) {
          context.report({ node: node.id, messageId: 'invalid' });
        }
      },
    };
  },
};

export default requireExportStringLiteralCatalogsAsConst;
