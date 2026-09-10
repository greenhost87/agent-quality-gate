import { defineRule, type Variable } from '@oxlint/plugins';

import { variableForName } from '../ast.ts';

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
      VariableDeclaration(node) {
        if (node.kind !== 'const') {
          return;
        }
        for (const declarator of node.declarations) {
          if (declarator.id.type !== 'Identifier' || declarator.init?.type !== 'Identifier') {
            continue;
          }
          const scope = context.sourceCode.getScope(declarator.init);
          const source = variableForName(scope, declarator.init.name);
          if (!source || hasNonInitWrite(source)) {
            continue;
          }
          context.report({
            node: declarator.id,
            messageId: 'identityAlias',
            data: { from: declarator.init.name, to: declarator.id.name },
          });
        }
      },
    };
  },
});
