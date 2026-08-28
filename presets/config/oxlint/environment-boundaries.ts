import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import { walkAstSkippingTypeAndJsxMarkup } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

const environmentModulePattern =
  /(?:^|\/)(?:system\/config\/environment|gate\/read-env\/read-env)\.[cm]?[jt]s$/u;

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
    function inspect(node: ESTree.Node): void {
      switch (node.type) {
        case 'AssignmentExpression':
          reportProcessEnvFromObjectPattern(context, node.left, node.right);
          break;
        case 'MemberExpression':
          if (isProcessEnvMember(node)) {
            context.report({ node, messageId: 'environment' });
          }
          break;
        case 'VariableDeclarator':
          reportProcessEnvFromObjectPattern(context, node.id, node.init ?? null);
          break;
        default:
          break;
      }
    }

    return {
      before() {
        const filename = context.filename.replaceAll('\\', '/');
        if (environmentModulePattern.test(filename)) {
          return false;
        }
        walkAstSkippingTypeAndJsxMarkup(context.sourceCode.ast, (node) => {
          inspect(node);
        });
        return false;
      },
      Program() {},
    };
  },
});
