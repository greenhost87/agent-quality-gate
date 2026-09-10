import { defineRule, type ESTree } from '@oxlint/plugins';

import {
  collectTestImports,
  isExternalTestModule,
  testImportOrigin,
  type TestOriginResolver,
} from '../test-substitution-bindings.ts';
import { isRecognizedTestFile } from './no-inline-multiline-test-data.ts';

import { staticPropertyName, staticStringValue } from '../ast.ts';

function isObjectMutation(node: ESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    ['Object', 'Reflect'].includes(callee.object.name) &&
    ['assign', 'defineProperty', 'defineProperties', 'set', 'deleteProperty'].includes(
      staticPropertyName(callee.property, callee.computed) ?? '',
    )
  );
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      production:
        'Do not replace production code in tests. Exercise real modules and DAO operations; substitute only external boundaries.',
      module:
        'Module replacements must target a statically known external package or builtin, never project modules or unresolved aliases.',
    },
  },
  createOnce(context) {
    let resolver: TestOriginResolver = { context, imports: new Map() };
    function reportOwned(
      node: ESTree.Node,
      target: ESTree.Node | undefined,
      includeInstances = false,
    ): void {
      if (target === undefined) {
        return;
      }
      const origin = testImportOrigin(resolver, target);
      if (
        origin !== undefined &&
        (includeInstances || !origin.constructed) &&
        !isExternalTestModule(origin.source, context.filename)
      ) {
        context.report({ node, messageId: 'production' });
      }
    }
    return {
      before() {
        if (!isRecognizedTestFile(context.filename)) {
          return false;
        }
        resolver = { context, imports: collectTestImports(context) };
        return undefined;
      },
      CallExpression(node) {
        const origin = testImportOrigin(resolver, node.callee);
        if (origin?.source === 'bun:test') {
          const path = origin.members.join('.');
          if (path === 'spyOn') {
            reportOwned(node, node.arguments[0], true);
          }
          if (path === 'mock.module') {
            const source = staticStringValue(node.arguments[0] ?? null);
            if (source === null || !isExternalTestModule(source, context.filename)) {
              context.report({ node, messageId: 'module' });
            }
          }
        }
        if (isObjectMutation(node)) {
          reportOwned(node, node.arguments[0]);
        }
      },
      AssignmentExpression(node) {
        reportOwned(
          node,
          node.left,
          node.right.type === 'ArrowFunctionExpression' || node.right.type === 'FunctionExpression',
        );
      },
      UpdateExpression(node) {
        reportOwned(node, node.argument);
      },
      UnaryExpression(node) {
        if (node.operator === 'delete') {
          reportOwned(node, node.argument);
        }
      },
    };
  },
});
