const noUselessExportedTypeAliases = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      uselessAlias: 'Do not export a type alias that only renames another type.',
    },
  },
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (
          node.parent.type === 'ExportNamedDeclaration' &&
          node.typeAnnotation.type === 'TSTypeReference' &&
          node.typeAnnotation.typeName.type === 'Identifier' &&
          node.typeAnnotation.typeArguments == null
        ) {
          context.report({ node: node.id, messageId: 'uselessAlias' });
        }
      },
    };
  },
};

export default noUselessExportedTypeAliases;
