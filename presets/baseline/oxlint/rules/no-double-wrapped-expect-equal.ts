import { defineRule, type ESTree } from '@oxlint/plugins';

import { unwrapExpression, walkAst } from 'agent-quality-gate/oxlint-walk';

function staticPropertyName(node: ESTree.Node, computed: boolean): string | null {
  if (!computed && node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function sameStaticCallee(left: ESTree.Node, right: ESTree.Node): boolean {
  const first = unwrapExpression(left);
  const second = unwrapExpression(right);
  if (first.type === 'Identifier' && second.type === 'Identifier') {
    return first.name === second.name;
  }
  if (first.type !== 'MemberExpression' || second.type !== 'MemberExpression') {
    return false;
  }
  const firstProperty = staticPropertyName(first.property, first.computed);
  const secondProperty = staticPropertyName(second.property, second.computed);
  if (firstProperty === null || secondProperty === null || firstProperty !== secondProperty) {
    return false;
  }
  return sameStaticCallee(first.object, second.object);
}

function callExpression(node: ESTree.Node | undefined): ESTree.CallExpression | null {
  if (node === undefined) {
    return null;
  }
  const unwrapped = unwrapExpression(node);
  if (unwrapped.type !== 'CallExpression') {
    return null;
  }
  return unwrapped;
}

function parseExpectToEqual(node: ESTree.CallExpression): {
  received: ESTree.Node | undefined;
  expected: ESTree.Node | undefined;
} | null {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.computed ||
    node.callee.property.type !== 'Identifier' ||
    node.callee.property.name !== 'toEqual' ||
    node.callee.object.type !== 'CallExpression' ||
    node.callee.object.callee.type !== 'Identifier' ||
    node.callee.object.callee.name !== 'expect' ||
    node.arguments.length !== 1
  ) {
    return null;
  }
  return {
    received: node.callee.object.arguments[0],
    expected: node.arguments[0],
  };
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      doubleWrapped:
        'Do not apply the same call to both sides of expect(...).toEqual(...). Compare values directly, or transform only the received value.',
    },
  },
  createOnce(context) {
    return {
      before() {
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type !== 'CallExpression') {
            return;
          }
          const parsed = parseExpectToEqual(node);
          if (!parsed) {
            return;
          }
          const receivedCall = callExpression(parsed.received);
          const expectedCall = callExpression(parsed.expected);
          if (
            receivedCall !== null &&
            expectedCall !== null &&
            sameStaticCallee(receivedCall.callee, expectedCall.callee)
          ) {
            context.report({ node, messageId: 'doubleWrapped' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
