import { defineRule } from '@oxlint/plugins';

import { unwrapExpression } from '../../../scripts/oxlint-walk/oxlint-walk.ts';
import { staticMemberName } from './static-member-name.ts';

const THROW_MATCHERS = new Set(['toThrow', 'toThrowError']);

export const noErrorInstanceInToThrow = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      noErrorInstance:
        'Do not pass an error instance to `.toThrow()`; pass the error class and message separately.',
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const callee = unwrapExpression(node.callee);
        if (callee.type !== 'MemberExpression') {
          return;
        }
        const matcher = staticMemberName(callee.property, callee.computed);
        if (matcher === null || !THROW_MATCHERS.has(matcher)) {
          return;
        }
        if (node.arguments.length !== 1) {
          return;
        }
        const argument = unwrapExpression(node.arguments[0]);
        if (argument.type !== 'NewExpression') {
          return;
        }
        context.report({ node: argument, messageId: 'noErrorInstance' });
      },
    };
  },
});
