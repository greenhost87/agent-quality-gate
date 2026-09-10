import { defineRule, type Context, type ESTree } from '@oxlint/plugins';
import * as v from 'valibot';
import { isAstNode } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

const OptionsSchema = v.object({ externalMockOrigins: v.optional(v.array(v.string()), []) });
const interceptionMethods = new Set(['route', 'routeFromHAR', 'routeWebSocket']);

export function staticName(node: ESTree.Node, computed = false): string | undefined {
  if (!computed && node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function externalOrigin(pattern: string): string | undefined {
  const authority = /^(?:https?|wss?):\/\/([^/?#]+)/u.exec(pattern)?.[1];
  if (authority === undefined || !/^[a-zA-Z0-9.-]+(?::[0-9]+)?$/u.test(authority)) {
    return undefined;
  }
  try {
    return new URL(pattern).origin;
  } catch {
    return undefined;
  }
}

function harPattern(node: ESTree.Node | undefined): ESTree.Node | undefined {
  if (node?.type !== 'ObjectExpression') {
    return undefined;
  }
  let url: ESTree.Node | undefined;
  for (const property of node.properties) {
    if (property.type !== 'Property' || property.computed) {
      return undefined;
    }
    if (staticName(property.key) === 'url') {
      if (url !== undefined) return undefined;
      url = property.value;
    }
  }
  return url;
}

function isInvokedMember(context: Context, node: ESTree.MemberExpression): boolean {
  const ancestors = context.sourceCode.getAncestors(node);
  const parent = ancestors[ancestors.length - 1];
  return isAstNode(parent) && parent.type === 'CallExpression' && parent.callee === node;
}

export const externalNetworkOnly = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { externalMockOrigins: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      external:
        'Playwright interception must use an absolute URL with an explicitly configured externalMockOrigins origin. Do not replace the application backend or use ambiguous matchers.',
      reference:
        'Invoke Playwright interception methods directly with an explicit external URL; do not alias or pass them as values.',
    },
  },
  createOnce(context) {
    let allowed = new Set<string>();
    return {
      before() {
        const filename = context.filename.replaceAll('\\', '/');
        const inE2e = /(?:^|\/)tests\/e2e\//u.test(filename);
        const config = /(?:^|\/)playwright\.config\.[cm]?[jt]s$/u.test(filename);
        if (!inE2e && !config && !context.sourceCode.text.includes('@playwright/test')) {
          return false;
        }
        allowed = new Set(v.parse(OptionsSchema, context.options[0] ?? {}).externalMockOrigins);
        return undefined;
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') {
          return;
        }
        const method = staticName(callee.property, callee.computed);
        if (method === undefined || !interceptionMethods.has(method)) {
          return;
        }
        const argument =
          method === 'routeFromHAR' ? harPattern(node.arguments[1]) : node.arguments[0];
        const pattern = argument === undefined ? undefined : staticName(argument, true);
        const origin = pattern === undefined ? undefined : externalOrigin(pattern);
        if (origin === undefined || !allowed.has(origin)) {
          context.report({ node, messageId: 'external' });
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern') return;
        for (const property of node.id.properties) {
          if (
            property.type === 'Property' &&
            interceptionMethods.has(staticName(property.key, property.computed) ?? '')
          ) {
            context.report({ node: property, messageId: 'reference' });
          }
        }
      },
      MemberExpression(node) {
        if (
          interceptionMethods.has(staticName(node.property, node.computed) ?? '') &&
          !isInvokedMember(context, node)
        ) {
          context.report({ node, messageId: 'reference' });
        }
      },
    };
  },
});
