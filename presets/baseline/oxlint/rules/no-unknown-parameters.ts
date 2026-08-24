import { defineRule, type ESTree } from '@oxlint/plugins';

import {
  nodeParams,
  paramTypeAnnotation,
  walkAst,
  walkAstSkippingTypeSubtrees,
} from 'agent-quality-gate/oxlint-walk';

function hasTypePredicateReturn(node: ESTree.Node): boolean {
  if (
    node.type !== 'ArrowFunctionExpression' &&
    node.type !== 'FunctionDeclaration' &&
    node.type !== 'FunctionExpression'
  ) {
    return false;
  }
  return node.returnType?.typeAnnotation.type === 'TSTypePredicate';
}

function reportUnknownInType(
  context: { report: (diagnostic: { node: ESTree.Node; messageId: string }) => void },
  node: ESTree.Node,
): void {
  walkAst(node, (child) => {
    if (child.type === 'TSUnknownKeyword') {
      context.report({ node: child, messageId: 'unknown' });
    }
  });
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      unknown: 'Do not use unknown in ordinary implementation parameters.',
    },
  },
  createOnce(context) {
    return {
      before() {
        walkAstSkippingTypeSubtrees(context.sourceCode.ast, (node) => {
          if (hasTypePredicateReturn(node)) {
            return;
          }
          const params = nodeParams(node);
          if (params == null) {
            return;
          }
          for (const param of params) {
            const typeNode = paramTypeAnnotation(param);
            if (typeNode != null) {
              reportUnknownInType(context, typeNode);
            }
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
