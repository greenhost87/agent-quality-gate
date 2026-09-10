import { defineRule, type ESTree } from '@oxlint/plugins';

import { isStaticString } from '../ast.ts';

function isStringLiteralType(node: ESTree.TSType): boolean {
  return node.type === 'TSLiteralType' && isStaticString(node.literal);
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      manual:
        'Manual exported string literal unions are forbidden. Export the values as an "as const" tuple and derive the union with "(typeof values)[number]".',
    },
  },
  createOnce(context) {
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
});
