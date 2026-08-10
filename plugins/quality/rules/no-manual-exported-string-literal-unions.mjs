import { isStaticString } from '../ast.mjs';

function isStringLiteralType(node) {
  return node.type === 'TSLiteralType' && isStaticString(node.literal);
}

const noManualExportedStringLiteralUnions = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      manual:
        'Manual exported string literal unions are forbidden. Export the values as an "as const" tuple and derive the union with "(typeof values)[number]".',
    },
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (
          declaration?.type === 'TSTypeAliasDeclaration' &&
          declaration.typeAnnotation.type === 'TSUnionType' &&
          declaration.typeAnnotation.types.every(isStringLiteralType)
        ) {
          context.report({ node: declaration.typeAnnotation, messageId: 'manual' });
        }
      },
    };
  },
};

export default noManualExportedStringLiteralUnions;
