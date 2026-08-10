function isRuntimeElementType(node) {
  return (
    node.objectType.type === 'TSTypeQuery' &&
    node.objectType.exprName.type === 'Identifier' &&
    node.objectType.typeArguments == null &&
    node.indexType.type === 'TSNumberKeyword'
  );
}

const noIndexedAccessTypes = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: 'Indexed access types are forbidden except for (typeof identifier)[number].',
    },
  },
  create(context) {
    return {
      TSIndexedAccessType(node) {
        if (!isRuntimeElementType(node)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

export default noIndexedAccessTypes;
