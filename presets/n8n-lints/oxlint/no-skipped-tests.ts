import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

import { staticMemberName } from './static-member-name.ts';

const TEST_OBJECTS = new Set(['test', 'it', 'describe']);
const PREFIXED_TEST_FUNCTIONS = new Set(['xtest', 'xit', 'xdescribe']);

function reportSkippedMember(
  context: {
    report: (descriptor: { node: ESTree.Node; messageId: 'removeSkip' | 'removeOnly' }) => void;
  },
  node: ESTree.MemberExpression,
): void {
  if (node.object.type !== 'Identifier' || !TEST_OBJECTS.has(node.object.name)) {
    return;
  }
  if (node.computed && node.property.type !== 'Literal') {
    return;
  }
  const method = staticMemberName(node.property, node.computed);
  if (method === 'skip') {
    context.report({ node, messageId: 'removeSkip' });
    return;
  }
  if (method === 'only') {
    context.report({ node, messageId: 'removeOnly' });
  }
}

function reportPrefixedTestCall(
  context: {
    report: (descriptor: { node: ESTree.Node; messageId: 'removeXPrefix' }) => void;
  },
  node: ESTree.CallExpression,
): void {
  if (node.callee.type === 'Identifier' && PREFIXED_TEST_FUNCTIONS.has(node.callee.name)) {
    context.report({ node, messageId: 'removeXPrefix' });
  }
}

export const noSkippedTests = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      removeSkip: 'Remove `.skip()` call; skipped tests rot silently.',
      removeOnly: 'Remove `.only()` call; focused tests hide the rest of the suite.',
      removeXPrefix: 'Remove the `x` prefix; the test is skipped.',
    },
  },
  createOnce(context) {
    return {
      MemberExpression(node) {
        reportSkippedMember(context, node);
      },
      CallExpression(node) {
        reportPrefixedTestCall(context, node);
      },
    };
  },
});
