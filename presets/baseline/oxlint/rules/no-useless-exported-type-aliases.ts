import { defineRule } from '@oxlint/plugins';

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      uselessAlias: 'Do not export a type alias that only renames another type.',
    },
  },
  createOnce(context) {
    return {
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (
          declaration?.type === 'TSTypeAliasDeclaration' &&
          declaration.typeAnnotation.type === 'TSTypeReference' &&
          declaration.typeAnnotation.typeName.type === 'Identifier' &&
          declaration.typeAnnotation.typeArguments == null
        ) {
          context.report({ node: declaration.id, messageId: 'uselessAlias' });
        }
      },
    };
  },
});
