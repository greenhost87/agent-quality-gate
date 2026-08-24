import type { Context, ESTree } from '@oxlint/plugins';

import { typeReferenceName } from './handmade-json-shape.ts';

function isNullLiteral(node: ESTree.Expression): boolean {
  return node.type === 'Literal' && node.value === null;
}

function isTypeofObject(node: ESTree.Expression, paramName: string): boolean {
  if (node.type !== 'BinaryExpression' || (node.operator !== '===' && node.operator !== '==')) {
    return false;
  }
  const sides =
    node.left.type === 'UnaryExpression'
      ? { typeofNode: node.left, literal: node.right }
      : node.right.type === 'UnaryExpression'
        ? { typeofNode: node.right, literal: node.left }
        : null;
  return (
    sides?.typeofNode.operator === 'typeof' &&
    sides.typeofNode.argument.type === 'Identifier' &&
    sides.typeofNode.argument.name === paramName &&
    sides.literal.type === 'Literal' &&
    sides.literal.value === 'object'
  );
}

function isNotNullCheck(node: ESTree.Expression, paramName: string): boolean {
  if (node.type !== 'BinaryExpression' || (node.operator !== '!==' && node.operator !== '!=')) {
    return false;
  }
  return (
    (node.left.type === 'Identifier' &&
      node.left.name === paramName &&
      isNullLiteral(node.right)) ||
    (node.right.type === 'Identifier' && node.right.name === paramName && isNullLiteral(node.left))
  );
}

function isNotArrayCheck(node: ESTree.Expression, paramName: string): boolean {
  if (node.type !== 'UnaryExpression' || node.operator !== '!') {
    return false;
  }
  const call = node.argument;
  return (
    call.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    call.callee.object.type === 'Identifier' &&
    call.callee.object.name === 'Array' &&
    call.callee.property.type === 'Identifier' &&
    call.callee.property.name === 'isArray' &&
    call.arguments.length === 1 &&
    call.arguments[0].type === 'Identifier' &&
    call.arguments[0].name === paramName
  );
}

function flattenLogicalAnd(node: ESTree.Expression): ESTree.Expression[] {
  if (node.type === 'LogicalExpression' && node.operator === '&&') {
    return [...flattenLogicalAnd(node.left), ...flattenLogicalAnd(node.right)];
  }
  return [node];
}

function isPlainObjectRecipe(body: ESTree.Expression, paramName: string): boolean {
  const parts = flattenLogicalAnd(body);
  if (parts.length !== 3) {
    return false;
  }
  let typeofObject = false;
  let notNull = false;
  let notArray = false;
  for (const part of parts) {
    if (isTypeofObject(part, paramName)) {
      typeofObject = true;
    } else if (isNotNullCheck(part, paramName)) {
      notNull = true;
    } else if (isNotArrayCheck(part, paramName)) {
      notArray = true;
    } else {
      return false;
    }
  }
  return typeofObject && notNull && notArray;
}

function functionParamName(node: ESTree.ArrowFunctionExpression | ESTree.Function): string | null {
  if (node.params.length !== 1) {
    return null;
  }
  const param = node.params[0];
  return param.type === 'Identifier' ? param.name : null;
}

function functionReturnPredicate(
  node: ESTree.ArrowFunctionExpression | ESTree.Function,
): ESTree.TSTypePredicate | null {
  const returnType = node.returnType?.typeAnnotation;
  return returnType?.type === 'TSTypePredicate' ? returnType : null;
}

function directReturnExpression(
  node: ESTree.ArrowFunctionExpression | ESTree.Function,
): ESTree.Expression | null {
  if (
    node.type === 'ArrowFunctionExpression' &&
    node.expression &&
    node.body.type !== 'BlockStatement'
  ) {
    return node.body;
  }
  const body = node.body;
  if (body?.type !== 'BlockStatement' || body.body.length !== 1) {
    return null;
  }
  const statement = body.body[0];
  return statement.type === 'ReturnStatement' ? statement.argument : null;
}

function reportGuardIfHandmade(
  context: Context,
  reportNode: ESTree.BindingIdentifier,
  fn: ESTree.ArrowFunctionExpression | ESTree.Function,
  handmadeNames: ReadonlySet<string>,
): void {
  const paramName = functionParamName(fn);
  const predicate = functionReturnPredicate(fn);
  const body = directReturnExpression(fn);
  if (paramName == null || predicate?.typeAnnotation == null || body == null) {
    return;
  }
  const target = typeReferenceName(predicate.typeAnnotation.typeAnnotation);
  if (target == null || !handmadeNames.has(target)) {
    return;
  }
  if (isPlainObjectRecipe(body, paramName)) {
    context.report({ node: reportNode, messageId: 'handmadeGuard' });
  }
}

export function reportHandmadeFunctionDeclaration(
  context: Context,
  node: ESTree.Function,
  handmadeNames: ReadonlySet<string>,
): void {
  if (node.id != null) {
    reportGuardIfHandmade(context, node.id, node, handmadeNames);
  }
}

export function reportHandmadeVariableDeclarator(
  context: Context,
  node: ESTree.VariableDeclarator,
  handmadeNames: ReadonlySet<string>,
): void {
  if (node.id.type !== 'Identifier' || node.init == null) {
    return;
  }
  if (node.init.type !== 'ArrowFunctionExpression' && node.init.type !== 'FunctionExpression') {
    return;
  }
  reportGuardIfHandmade(context, node.id, node.init, handmadeNames);
}
