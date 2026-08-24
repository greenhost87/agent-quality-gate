import { defineRule, type Variable } from '@oxlint/plugins';

import { variableForName } from '../ast.ts';
import { walkAst } from 'agent-quality-gate/oxlint-walk';

function hasNonInitWrite(variable: Variable): boolean {
  return variable.references.some((reference) => reference.isWrite() && !reference.init);
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      identityAlias: 'Use "{{from}}" directly instead of aliasing it as "{{to}}".',
    },
  },
  createOnce(context) {
    return {
      before() {
        walkAst(context.sourceCode.ast, (node, parent) => {
          if (node.type !== 'VariableDeclarator') {
            return;
          }
          if (node.id.type !== 'Identifier' || node.init?.type !== 'Identifier') {
            return;
          }
          if (parent?.type !== 'VariableDeclaration' || parent.kind !== 'const') {
            return;
          }

          const scope = context.sourceCode.getScope(node.init);
          const source = variableForName(scope, node.init.name);
          if (!source || hasNonInitWrite(source)) {
            return;
          }

          context.report({
            node: node.id,
            messageId: 'identityAlias',
            data: { from: node.init.name, to: node.id.name },
          });
        });
        return false;
      },
      Program() {},
    };
  },
});
