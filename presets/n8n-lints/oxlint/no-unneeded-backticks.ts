import { defineRule, type ESTree } from '@oxlint/plugins';

import { isAstNode } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

export const noUnneededBackticks = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      noUnneededBackticks: 'Use single or double quotes for strings without interpolation.',
    },
  },
  createOnce(context) {
    function parentOf(node: ESTree.Node): ESTree.Node | null {
      const ancestors = context.sourceCode.getAncestors(node);
      const parent = ancestors[ancestors.length - 1];
      return isAstNode(parent) ? parent : null;
    }

    return {
      TemplateLiteral(node) {
        if (node.expressions.length > 0) {
          return;
        }
        // Tagged templates may depend on the template form; leave them alone.
        if (parentOf(node)?.type === 'TaggedTemplateExpression') {
          return;
        }
        const raw = node.quasis.map((quasi) => quasi.value.raw).join('');
        // Multiline strings legitimately use backticks.
        if (raw.includes('\n')) {
          return;
        }
        context.report({ node, messageId: 'noUnneededBackticks' });
      },
    };
  },
});
