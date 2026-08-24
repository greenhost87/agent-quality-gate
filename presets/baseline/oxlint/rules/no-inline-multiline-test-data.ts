import { defineRule, type ESTree } from '@oxlint/plugins';

import { walkAst } from 'agent-quality-gate/oxlint-walk';

const DIAGNOSTIC =
  'Do not embed multi-line test data. Store it in a fixture file and load it in the test.';

const TEST_PATH_SEGMENT = /(?:^|\/)(?:test|tests|spec|specs|__tests__|e2e)(?:\/|$)/;
const TEST_FILENAME = /\.(?:test|spec)\.[^/]+$/;

export function isRecognizedTestFile(filename: string): boolean {
  const normalized = filename.replaceAll('\\', '/');
  if (normalized === '<input>' || normalized === '<text>') {
    return false;
  }
  return TEST_PATH_SEGMENT.test(normalized) || TEST_FILENAME.test(normalized);
}

export function isInlineMultilineTestData(value: string): boolean {
  if (value.indexOf('\n') === -1) {
    return false;
  }
  let nonblank = 0;
  for (const line of value.split(/\r?\n/)) {
    if (line.trim().length > 0) {
      nonblank += 1;
      if (nonblank >= 2) {
        return true;
      }
    }
  }
  return false;
}

function stringLiteralValue(node: ESTree.Node): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function staticTemplateLiteralValue(node: ESTree.TemplateLiteral): string | null {
  if (node.expressions.length > 0) {
    return null;
  }
  return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
}

function templateLiteralShapeValue(node: ESTree.TemplateLiteral): string {
  let value = node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? '';
  for (let index = 0; index < node.expressions.length; index += 1) {
    const quasi = node.quasis[index + 1];
    value += `x${quasi?.value.cooked ?? quasi?.value.raw ?? ''}`;
  }
  return value;
}

function staticStringExpressionValue(node: ESTree.Node | null): string | null {
  if (node === null) {
    return null;
  }
  const literal = stringLiteralValue(node);
  if (literal !== null) {
    return literal;
  }
  if (node.type === 'TemplateLiteral') {
    return staticTemplateLiteralValue(node);
  }
  if (node.type !== 'BinaryExpression' || node.operator !== '+') {
    return null;
  }
  const left = staticStringExpressionValue(node.left);
  const right = staticStringExpressionValue(node.right);
  return left === null || right === null ? null : left + right;
}

function isStaticNewlineSeparator(node: ESTree.Node | undefined): boolean {
  return node !== undefined && staticStringExpressionValue(node) === '\n';
}

function isNewlineJoinCall(node: ESTree.CallExpression): boolean {
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'join' &&
    node.callee.object.type === 'ArrayExpression' &&
    node.arguments.length === 1 &&
    isStaticNewlineSeparator(node.arguments[0])
  );
}

function staticNewlineJoinParts(node: ESTree.CallExpression): string[] | null {
  if (!isNewlineJoinCall(node) || node.callee.type !== 'MemberExpression') {
    return null;
  }
  const array = node.callee.object;
  if (array.type !== 'ArrayExpression') {
    return null;
  }
  const parts: string[] = [];
  for (const element of array.elements) {
    const value = staticStringExpressionValue(element);
    if (value === null) {
      return null;
    }
    parts.push(value);
  }
  return parts;
}

function newlineJoinedArrayIsMultiline(node: ESTree.CallExpression): boolean | null {
  const parts = staticNewlineJoinParts(node);
  if (parts === null) {
    return null;
  }
  let nonblank = 0;
  for (const value of parts) {
    if (isInlineMultilineTestData(value)) {
      return true;
    }
    if (value.trim().length > 0) {
      nonblank += 1;
      if (nonblank >= 2) {
        return true;
      }
    }
  }
  return false;
}

function isInsideStaticConcatenation(
  node: ESTree.Node,
  parentOf: (node: ESTree.Node) => ESTree.Node | null | undefined,
): boolean {
  const parent = parentOf(node);
  return (
    parent?.type === 'BinaryExpression' &&
    parent.operator === '+' &&
    staticStringExpressionValue(parent) !== null
  );
}

function isStaticNewlineJoinArrayElement(
  node: ESTree.Node,
  parentOf: (node: ESTree.Node) => ESTree.Node | null | undefined,
): boolean {
  const array = parentOf(node);
  if (array?.type !== 'ArrayExpression') {
    return false;
  }
  const member = parentOf(array);
  if (
    member?.type !== 'MemberExpression' ||
    member.object !== array ||
    member.computed ||
    member.property.type !== 'Identifier' ||
    member.property.name !== 'join'
  ) {
    return false;
  }
  const call = parentOf(member);
  return (
    call?.type === 'CallExpression' &&
    call.callee === member &&
    staticNewlineJoinParts(call) !== null
  );
}

function reportEmbeddedData(
  context: {
    report: (descriptor: { node: ESTree.Node; messageId: 'inlineData' }) => void;
  },
  node: ESTree.Node,
  parentOf: (node: ESTree.Node) => ESTree.Node | null | undefined,
  value: string | null,
  skipNestedExpressions: boolean,
): void {
  if (value === null || !isInlineMultilineTestData(value)) {
    return;
  }
  if (
    skipNestedExpressions &&
    (isInsideStaticConcatenation(node, parentOf) || isStaticNewlineJoinArrayElement(node, parentOf))
  ) {
    return;
  }
  context.report({ node, messageId: 'inlineData' });
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      inlineData: DIAGNOSTIC,
    },
  },
  createOnce(context) {
    return {
      before() {
        if (!isRecognizedTestFile(context.filename)) {
          return false;
        }
        const parents = new WeakMap<ESTree.Node, ESTree.Node | null>();
        const parentOf = (node: ESTree.Node): ESTree.Node | null | undefined => parents.get(node);
        walkAst(context.sourceCode.ast, (node, parent) => {
          parents.set(node, parent);
          switch (node.type) {
            case 'BinaryExpression':
              reportEmbeddedData(context, node, parentOf, staticStringExpressionValue(node), true);
              break;
            case 'Literal':
              reportEmbeddedData(context, node, parentOf, stringLiteralValue(node), true);
              break;
            case 'TemplateLiteral':
              reportEmbeddedData(context, node, parentOf, templateLiteralShapeValue(node), true);
              break;
            case 'CallExpression':
              if (newlineJoinedArrayIsMultiline(node) === true) {
                context.report({ node, messageId: 'inlineData' });
              }
              break;
            default:
              break;
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
