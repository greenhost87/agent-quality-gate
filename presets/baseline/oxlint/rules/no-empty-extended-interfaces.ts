import { defineRule } from '@oxlint/plugins';

import { walkAst } from 'agent-quality-gate/oxlint-walk';

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      emptyInterface:
        'Do not declare an interface that only extends another type without adding members.',
    },
  },
  createOnce(context) {
    return {
      before() {
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type !== 'TSInterfaceDeclaration') {
            return;
          }
          if (node.extends.length > 0 && node.body.body.length === 0) {
            context.report({ node: node.id, messageId: 'emptyInterface' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
