import { directParameterType } from './ast.mjs';

export function createParameterUnionRule(messageId, message, violates) {
  return {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        [messageId]: message,
      },
    },
    create(context) {
      return {
        TSUnionType(node) {
          if (directParameterType(node) && violates(node)) {
            context.report({ node, messageId });
          }
        },
      };
    },
  };
}
