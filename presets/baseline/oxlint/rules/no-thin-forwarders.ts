import { defineRule, type ESTree } from '@oxlint/plugins';

import {
  declarationNode,
  addIdentifierDeclaratorNames,
  isFunctionLike,
  directReturnExpression,
} from '../ast.ts';
import { walkAst } from 'agent-quality-gate/oxlint-walk';

function addExportedDeclarationNames(names: Set<string>, declaration: ESTree.Declaration): void {
  if (declaration.type === 'FunctionDeclaration' && declaration.id) {
    names.add(declaration.id.name);
    return;
  }
  if (declaration.type !== 'VariableDeclaration') {
    return;
  }
  addIdentifierDeclaratorNames(names, declaration);
}

function collectExportedNames(program: ESTree.Program): Set<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    addExportedNames(names, statement);
  }
  return names;
}

function addExportedNames(names: Set<string>, statement: ESTree.Statement): void {
  if (statement.type === 'ExportNamedDeclaration') {
    addNamedExportedNames(names, statement);
    return;
  }
  if (statement.type === 'ExportDefaultDeclaration') {
    addDefaultExportedName(names, statement);
  }
}

function addNamedExportedNames(names: Set<string>, statement: ESTree.ExportNamedDeclaration): void {
  if (statement.declaration) {
    addExportedDeclarationNames(names, statement.declaration);
    return;
  }
  if (statement.source != null) {
    return;
  }
  for (const specifier of statement.specifiers) {
    if (specifier.local.type === 'Identifier') {
      names.add(specifier.local.name);
    }
  }
}

function addDefaultExportedName(
  names: Set<string>,
  statement: ESTree.ExportDefaultDeclaration,
): void {
  const { declaration } = statement;
  if (declaration.type === 'Identifier') {
    names.add(declaration.name);
    return;
  }
  if (declaration.type === 'FunctionDeclaration' && declaration.id) {
    names.add(declaration.id.name);
  }
}

function returnedCall(expression: ESTree.Expression): ESTree.CallExpression | null {
  if (expression.type === 'CallExpression') {
    return expression;
  }
  if (expression.type === 'AwaitExpression' && expression.argument.type === 'CallExpression') {
    return expression.argument;
  }
  return null;
}

function directlyForwardsParameter(
  argument: ESTree.Argument,
  parameter: ESTree.ParamPattern | undefined,
): boolean {
  if (!parameter) {
    return false;
  }
  if (argument.type === 'Identifier' && parameter.type === 'Identifier') {
    return argument.name === parameter.name;
  }
  return (
    argument.type === 'SpreadElement' &&
    argument.argument.type === 'Identifier' &&
    parameter.type === 'RestElement' &&
    parameter.argument.type === 'Identifier' &&
    argument.argument.name === parameter.argument.name
  );
}

function positionalThinForward(
  call: ESTree.CallExpression,
  params: readonly ESTree.ParamPattern[],
): boolean {
  if (call.arguments.length !== params.length) {
    return false;
  }
  return call.arguments.every((argument, index) =>
    directlyForwardsParameter(argument, params[index]),
  );
}

function identifierParamNames(params: readonly ESTree.ParamPattern[]): Set<string> | null {
  const names = new Set<string>();
  for (const parameter of params) {
    if (parameter.type !== 'Identifier') {
      return null;
    }
    names.add(parameter.name);
  }
  return names;
}

function simpleObjectPropertyKeyName(
  key: ESTree.Expression | ESTree.PrivateIdentifier,
  computed: boolean,
): string | null {
  if (computed) {
    return null;
  }
  if (key.type === 'Identifier') {
    return key.name;
  }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

function expressionIsThinObjectValue(expression: ESTree.Expression): boolean {
  let forbidden = false;
  walkAst(expression, (node) => {
    if (
      node.type === 'CallExpression' ||
      node.type === 'NewExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ClassExpression'
    ) {
      forbidden = true;
    }
  });
  return !forbidden;
}

function objectPropertyFitsAdapter(
  property: ESTree.ObjectPropertyKind,
  paramNames: ReadonlySet<string>,
  forwarded: Set<string>,
): boolean {
  if (property.type !== 'Property' || property.kind !== 'init') {
    return false;
  }
  if (simpleObjectPropertyKeyName(property.key, property.computed) === null) {
    return false;
  }
  if (property.value.type === 'Identifier' && paramNames.has(property.value.name)) {
    forwarded.add(property.value.name);
    return true;
  }
  return expressionIsThinObjectValue(property.value);
}

function allParamsForwarded(
  paramNames: ReadonlySet<string>,
  forwarded: ReadonlySet<string>,
): boolean {
  for (const name of paramNames) {
    if (!forwarded.has(name)) {
      return false;
    }
  }
  return true;
}

function objectAdapterThinForward(
  call: ESTree.CallExpression,
  params: readonly ESTree.ParamPattern[],
): boolean {
  if (call.arguments.length !== 1) {
    return false;
  }
  const argument = call.arguments[0];
  if (argument?.type !== 'ObjectExpression') {
    return false;
  }
  const paramNames = identifierParamNames(params);
  if (paramNames === null || paramNames.size === 0) {
    return false;
  }
  const forwarded = new Set<string>();
  for (const property of argument.properties) {
    if (!objectPropertyFitsAdapter(property, paramNames, forwarded)) {
      return false;
    }
  }
  return allParamsForwarded(paramNames, forwarded);
}

function thinForwarder(
  node: ESTree.ArrowFunctionExpression | ESTree.Function,
  name: string,
): boolean {
  if (node.params.length === 0) {
    return false;
  }
  const body = directReturnExpression(node);
  if (body == null) {
    return false;
  }
  const call = returnedCall(body);
  if (call === null) {
    return false;
  }
  if (call.callee.type === 'Identifier' && call.callee.name === name) {
    return false;
  }
  return positionalThinForward(call, node.params) || objectAdapterThinForward(call, node.params);
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      thinForwarder: 'Do not wrap calls in thin forwarder "{{name}}"; call the target directly.',
    },
  },
  createOnce(context) {
    function checkProgram(program: ESTree.Program): void {
      const exportedNames = collectExportedNames(program);
      for (const statement of program.body) {
        const declaration = declarationNode(statement);
        if (
          declaration?.type === 'FunctionDeclaration' &&
          declaration.id &&
          !exportedNames.has(declaration.id.name) &&
          thinForwarder(declaration, declaration.id.name)
        ) {
          context.report({
            node: declaration.id,
            messageId: 'thinForwarder',
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
            !exportedNames.has(item.id.name) &&
            thinForwarder(item.init, item.id.name)
          ) {
            context.report({
              node: item.id,
              messageId: 'thinForwarder',
              data: { name: item.id.name },
            });
          }
        }
      }
    }

    return {
      // Top-level scan only; skip the visitor walk after reporting.
      // Empty Program keeps the rule interested in Program nodes so oxlint
      // still invokes `before` under interest-based skipping.
      before() {
        checkProgram(context.sourceCode.ast);
        return false;
      },
      Program() {},
    };
  },
});
