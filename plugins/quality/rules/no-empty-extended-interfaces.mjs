const noEmptyExtendedInterfaces = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      emptyInterface: 'Do not declare an interface that only extends another type without adding members.',
    },
  },
  create(context) {
    return {
      TSInterfaceDeclaration(node) {
        if (node.extends.length > 0 && node.body.body.length === 0) {
          context.report({ node: node.id, messageId: 'emptyInterface' });
        }
      },
    };
  },
};

export default noEmptyExtendedInterfaces;
