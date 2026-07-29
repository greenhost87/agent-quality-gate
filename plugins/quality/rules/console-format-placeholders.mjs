const consoleMethods = new Set(['debug', 'error', 'info', 'log', 'trace', 'warn']);
const placeholderPattern = /%[%sdifjoOc]/gu;

function isConsoleMethodCall(node) {
  if (
    node.callee.type !== 'MemberExpression' ||
    node.callee.object.type !== 'Identifier' ||
    node.callee.object.name !== 'console'
  ) {
    return false;
  }
  if (!node.callee.computed) {
    return node.callee.property.type === 'Identifier' && consoleMethods.has(node.callee.property.name);
  }
  return (
    node.callee.property.type === 'Literal' &&
    typeof node.callee.property.value === 'string' &&
    consoleMethods.has(node.callee.property.value)
  );
}

function staticStringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
  }
  return null;
}

function placeholderCount(format) {
  return Array.from(format.matchAll(placeholderPattern)).filter((match) => match[0] !== '%%').length;
}

const consoleFormatPlaceholders = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      dynamic: 'Console output with dynamic values must use format placeholders.',
      mismatch: 'Console format placeholder count must match the dynamic argument count.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isConsoleMethodCall(node)) {
          return;
        }
        if (node.arguments.length <= 1) {
          if (node.arguments[0] && staticStringValue(node.arguments[0]) === null) {
            context.report({ node, messageId: 'dynamic' });
          }
          return;
        }
        const format = staticStringValue(node.arguments[0]);
        if (format === null || placeholderCount(format) !== node.arguments.length - 1) {
          context.report({ node, messageId: 'mismatch' });
        }
      },
    };
  },
};

export default consoleFormatPlaceholders;
