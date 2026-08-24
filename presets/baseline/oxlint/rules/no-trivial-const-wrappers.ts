import { defineRule, type ESTree } from '@oxlint/plugins';

import { declarationNode, directReturnExpression, isFunctionLike } from '../ast.ts';
import { walkAst } from 'agent-quality-gate/oxlint-walk';

function unwrapExpression(node: ESTree.Expression): ESTree.Expression {
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'TSNonNullExpression'
  ) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function trivialConstWrapper(node: ESTree.ArrowFunctionExpression | ESTree.Function): boolean {
  if (node.params.length !== 0) {
    return false;
  }
  const returned = directReturnExpression(node);
  if (returned == null) {
    return false;
  }
  const expression = unwrapExpression(returned);
  if (expression.type === 'Identifier') {
    return true;
  }
  if (expression.type === 'ArrayExpression' && expression.elements.length === 1) {
    const element = expression.elements[0];
    return element?.type === 'SpreadElement' && element.argument.type === 'Identifier';
  }
  if (expression.type === 'ObjectExpression' && expression.properties.length === 1) {
    const property = expression.properties[0];
    return property?.type === 'SpreadElement' && property.argument.type === 'Identifier';
  }
  return false;
}

function catalogReference(node: ESTree.Expression): boolean {
  if (node.type === 'Identifier') {
    return true;
  }
  return (
    node.type === 'ArrayExpression' &&
    node.elements.length === 1 &&
    node.elements[0]?.type === 'SpreadElement' &&
    node.elements[0].argument.type === 'Identifier'
  );
}

function castIncludesCall(node: ESTree.CallExpression): boolean {
  if (node.callee.type !== 'MemberExpression' || node.callee.computed) {
    return false;
  }
  if (node.callee.property.type !== 'Identifier' || node.callee.property.name !== 'includes') {
    return false;
  }
  const object = node.callee.object;
  if (object.type !== 'TSAsExpression' && object.type !== 'TSTypeAssertion') {
    return false;
  }
  return catalogReference(object.expression);
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      trivialConstWrapper:
        'Do not wrap a constant in "{{name}}"; export or use the value directly instead of returning it or a shallow copy.',
      castIncludes:
        'Do not cast a catalog to call .includes; use .some((value) => value === candidate) or a Set derived from the catalog.',
    },
  },
  createOnce(context) {
    function checkTopLevelWrappers(program: ESTree.Program): void {
      for (const statement of program.body) {
        const declaration = declarationNode(statement);
        if (
          declaration?.type === 'FunctionDeclaration' &&
          declaration.id &&
          trivialConstWrapper(declaration)
        ) {
          context.report({
            node: declaration.id,
            messageId: 'trivialConstWrapper',
            data: { name: declaration.id.name },
          });
        }
        if (declaration?.type !== 'VariableDeclaration') {
          continue;
        }
        for (const item of declaration.declarations) {
          if (
            item.id.type === 'Identifier' &&
            item.init &&
            isFunctionLike(item.init) &&
            trivialConstWrapper(item.init)
          ) {
            context.report({
              node: item.id,
              messageId: 'trivialConstWrapper',
              data: { name: item.id.name },
            });
          }
        }
      }
    }

    return {
      before() {
        checkTopLevelWrappers(context.sourceCode.ast);
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type === 'CallExpression' && castIncludesCall(node)) {
            context.report({ node, messageId: 'castIncludes' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
