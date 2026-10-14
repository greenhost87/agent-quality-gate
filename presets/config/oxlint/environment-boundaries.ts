import { posix } from 'node:path';

import { defineRule, type Context, type ESTree } from '@oxlint/plugins';
import * as v from 'valibot';

const DEFAULT_ENVIRONMENT_PATH = 'system/config/environment.ts';
const internalEnvironmentModulePattern = /(?:^|\/)gate\/read-env\/read-env\.[cm]?[jt]s$/u;
const instrumentationFilePattern = /(?:^|\/)instrumentation\.[cm]?[jt]s$/u;
const allowedInstrumentationEnvKey = 'NEXT_RUNTIME';
const OptionsSchema = v.object({
  environmentPath: v.optional(v.string(), DEFAULT_ENVIRONMENT_PATH),
});

function isEnvironmentModule(filename: string, cwd: string, environmentPath: string): boolean {
  const expected = posix.join(cwd, environmentPath);
  return filename === expected || internalEnvironmentModulePattern.test(filename);
}

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

function reportEnvironment(context: Context, node: ESTree.Node, environmentPath: string): void {
  context.report({ node, messageId: 'environment', data: { environmentPath } });
}

function reportProcessEnvFromObjectPattern(
  context: Context,
  pattern: ESTree.Node,
  processNode: ESTree.Node | null,
  environmentPath: string,
): void {
  if (processNode == null || !isProcessIdentifier(processNode)) {
    return;
  }
  const property = processEnvProperty(pattern);
  if (property != null) {
    reportEnvironment(context, property, environmentPath);
  }
}

export const environmentBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { environmentPath: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      environment: 'Access environment variables only through {{environmentPath}}.',
    },
  },
  createOnce(context) {
    let allowInstrumentationNextRuntime = false;
    let environmentPath = DEFAULT_ENVIRONMENT_PATH;
    return {
      before() {
        const filename = context.filename.replaceAll('\\', '/');
        environmentPath = v.parse(OptionsSchema, context.options[0] ?? {}).environmentPath;
        if (isEnvironmentModule(filename, context.cwd.replaceAll('\\', '/'), environmentPath)) {
          return false;
        }
        allowInstrumentationNextRuntime = instrumentationFilePattern.test(filename);
        return undefined;
      },
      AssignmentExpression(node) {
        reportProcessEnvFromObjectPattern(context, node.left, node.right, environmentPath);
      },
      MemberExpression(node) {
        if (!isProcessEnvMember(node)) {
          return;
        }
        if (allowInstrumentationNextRuntime && isAllowedInstrumentationNextRuntime(node)) {
          return;
        }
        reportEnvironment(context, node, environmentPath);
      },
      VariableDeclarator(node) {
        reportProcessEnvFromObjectPattern(context, node.id, node.init ?? null, environmentPath);
      },
    };
  },
});
