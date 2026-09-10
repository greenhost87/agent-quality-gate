import { defineRule, type ESTree } from '@oxlint/plugins';

import { unwrapExpression } from '../../../../scripts/oxlint-walk/oxlint-walk.ts';

function jsonMethodCall(node: ESTree.Node, method: string): ESTree.CallExpression | null {
  const call = unwrapExpression(node);
  if (call.type !== 'CallExpression') {
    return null;
  }
  const callee = unwrapExpression(call.callee);
  if (callee.type !== 'MemberExpression') {
    return null;
  }
  if (callee.object.type !== 'Identifier' || callee.object.name !== 'JSON') {
    return null;
  }
  if (callee.computed) {
    if (callee.property.type !== 'Literal' || callee.property.value !== method) {
      return null;
    }
  } else if (callee.property.type !== 'Identifier' || callee.property.name !== method) {
    return null;
  }
  return call;
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      noJsonParseJsonStringify:
        'Replace `JSON.parse(JSON.stringify(value))` with `structuredClone(value)`.',
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        const parseCall = jsonMethodCall(node, 'parse');
        if (parseCall === null) {
          return;
        }
        if (parseCall.arguments.length !== 1) {
          return;
        }
        const firstArgument = parseCall.arguments[0];
        if (firstArgument === undefined) {
          return;
        }
        const stringifyCall = jsonMethodCall(firstArgument, 'stringify');
        if (stringifyCall === null) {
          return;
        }
        if (stringifyCall.arguments.length !== 1) {
          return;
        }
        context.report({ node: parseCall, messageId: 'noJsonParseJsonStringify' });
      },
    };
  },
});
