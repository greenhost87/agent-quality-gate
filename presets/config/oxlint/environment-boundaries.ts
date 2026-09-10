import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

const environmentModulePattern =
  /(?:^|\/)(?:system\/config\/environment|gate\/read-env\/read-env)\.[cm]?[jt]s$/u;
const instrumentationFilePattern = /(?:^|\/)instrumentation\.[cm]?[jt]s$/u;
const allowedInstrumentationEnvKey = 'NEXT_RUNTIME';

function propertyName(node: ESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (
    node.computed &&
    node.property.type === 'Literal' &&
    typeof node.property.value === 'string'
  ) {
    return node.property.value;
  }
  return null;
}

function isProcessIdentifier(node: ESTree.Node): boolean {
  return node.type === 'Identifier' && node.name === 'process';
}

function isProcessEnvMember(node: ESTree.MemberExpression): boolean {
  return isProcessIdentifier(node.object) && propertyName(node) === 'env';
}

function isAllowedInstrumentationNextRuntime(node: ESTree.MemberExpression): boolean {
  const parent = node.parent;
  if (parent.type !== 'MemberExpression' || parent.object !== node) {
    return false;
  }
  return propertyName(parent) === allowedInstrumentationEnvKey;
}

function processEnvProperty(pattern: ESTree.Node): ESTree.Node | null {
  if (pattern.type !== 'ObjectPattern') {
    return null;
  }
  for (const property of pattern.properties) {
    if (property.type !== 'Property') {
      continue;
    }
    if (!property.computed && property.key.type === 'Identifier' && property.key.name === 'env') {
      return property;
    }
    if (property.computed && property.key.type === 'Literal' && property.key.value === 'env') {
      return property;
    }
  }
  return null;
}

function reportProcessEnvFromObjectPattern(
  context: Context,
  pattern: ESTree.Node,
  processNode: ESTree.Node | null,
): void {
  if (processNode == null || !isProcessIdentifier(processNode)) {
    return;
  }
  const property = processEnvProperty(pattern);
  if (property != null) {
    context.report({ node: property, messageId: 'environment' });
  }
}

export const environmentBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      environment: 'Access environment variables only through system/config/environment.ts.',
    },
  },
  createOnce(context) {
    let allowInstrumentationNextRuntime = false;
    return {
      before() {
        const filename = context.filename.replaceAll('\\', '/');
        if (environmentModulePattern.test(filename)) {
          return false;
        }
        allowInstrumentationNextRuntime = instrumentationFilePattern.test(filename);
        return undefined;
      },
      AssignmentExpression(node) {
        reportProcessEnvFromObjectPattern(context, node.left, node.right);
      },
      MemberExpression(node) {
        if (!isProcessEnvMember(node)) {
          return;
        }
        if (allowInstrumentationNextRuntime && isAllowedInstrumentationNextRuntime(node)) {
          return;
        }
        context.report({ node, messageId: 'environment' });
      },
      VariableDeclarator(node) {
        reportProcessEnvFromObjectPattern(context, node.id, node.init ?? null);
      },
    };
  },
});
