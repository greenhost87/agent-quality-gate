import { defineRule, type ESTree } from '@oxlint/plugins';

import { walkAst } from 'agent-quality-gate/oxlint-walk';

function isConsoleMethod(name: string): boolean {
  return (
    name === 'debug' ||
    name === 'error' ||
    name === 'info' ||
    name === 'log' ||
    name === 'trace' ||
    name === 'warn'
  );
}

function isPlaceholderSpecifierCode(code: number): boolean {
  return (
    code === 115 ||
    code === 100 ||
    code === 105 ||
    code === 102 ||
    code === 106 ||
    code === 111 ||
    code === 79 ||
    code === 99
  );
}

function isConsoleMethodCall(node: ESTree.CallExpression): boolean {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.object.type !== 'Identifier' ||
    node.callee.object.name !== 'console'
  ) {
    return false;
  }
  if (!node.callee.computed) {
    return node.callee.property.type === 'Identifier' && isConsoleMethod(node.callee.property.name);
  }
  return (
    node.callee.property.type === 'Literal' &&
    typeof node.callee.property.value === 'string' &&
    isConsoleMethod(node.callee.property.value)
  );
}

function staticStringValue(node: ESTree.Node | null): string | null {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
  }
  return null;
}

function placeholderCount(format: string): number {
  let count = 0;

  for (let index = 0; index < format.length - 1; index += 1) {
    if (format.charCodeAt(index) !== 37) {
      continue;
    }
    const specifierCode = format.charCodeAt(index + 1);
    if (specifierCode === 37) {
      index += 1;
      continue;
    }
    if (isPlaceholderSpecifierCode(specifierCode)) {
      count += 1;
      index += 1;
    }
  }

  return count;
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      dynamic: 'Console output with dynamic values must use format placeholders.',
      mismatch: 'Console format placeholder count must match the dynamic argument count.',
    },
  },
  createOnce(context) {
    return {
      before() {
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type !== 'CallExpression' || !isConsoleMethodCall(node)) {
            return;
          }
          if (node.arguments.length <= 1) {
            if (node.arguments[0] && staticStringValue(node.arguments[0]) === null) {
              context.report({ node, messageId: 'dynamic' });
            }
            return;
          }
          const format = staticStringValue(node.arguments[0] ?? null);
          if (format === null || placeholderCount(format) !== node.arguments.length - 1) {
            context.report({ node, messageId: 'mismatch' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
