import { defineRule } from '@oxlint/plugins';

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      emptyInterface: 'Do not declare empty interfaces.',
    },
  },
  createOnce(context) {
    return {
      TSInterfaceDeclaration(node) {
        if (node.body.body.length === 0) {
          context.report({ node: node.id, messageId: 'emptyInterface' });
        }
      },
    };
  },
});
