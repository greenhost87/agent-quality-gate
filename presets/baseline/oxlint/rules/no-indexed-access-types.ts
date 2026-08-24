import { defineRule, type ESTree } from '@oxlint/plugins';

import { walkAst } from 'agent-quality-gate/oxlint-walk';

function unwrapParenthesizedType(node: ESTree.Node): ESTree.Node {
  let current = node;
  while (current.type === 'TSParenthesizedType') {
    current = current.typeAnnotation;
  }
  return current;
}

function isRuntimeElementType(node: ESTree.TSIndexedAccessType): boolean {
  const objectType = unwrapParenthesizedType(node.objectType);
  return (
    objectType.type === 'TSTypeQuery' &&
    objectType.exprName.type === 'Identifier' &&
    objectType.typeArguments == null &&
    node.indexType.type === 'TSNumberKeyword'
  );
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: 'Indexed access types are forbidden except for (typeof identifier)[number].',
    },
  },
  createOnce(context) {
    return {
      before() {
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type !== 'TSIndexedAccessType') {
            return;
          }
          if (!isRuntimeElementType(node)) {
            context.report({ node, messageId: 'forbidden' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
