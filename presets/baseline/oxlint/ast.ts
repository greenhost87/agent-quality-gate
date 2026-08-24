import { type ESTree, type Scope, type Variable } from '@oxlint/plugins';

export function declarationNode(
  statement: ESTree.Node,
): ESTree.Declaration | ESTree.ExportDefaultDeclarationKind | ESTree.Node | null {
  if (
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportDefaultDeclaration'
  ) {
    return statement.declaration;
  }
  return statement;
}

export function variableForName(scope: Scope, name: string): Variable | undefined {
  for (let current: Scope | null = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) {
      return variable;
    }
  }
  return undefined;
}

export function directParameterType(node: ESTree.Node): boolean {
  const annotation = node.parent;
  if (annotation?.type !== 'TSTypeAnnotation' || annotation.typeAnnotation !== node) {
    return false;
  }
  const parameter = annotation.parent;
  const owner = parameter.parent;
  if (owner == null || !('params' in owner) || !Array.isArray(owner.params)) {
    return false;
  }
  return owner.params.some((param) => param === parameter);
}

export function isStaticString(
  node: ESTree.Node | null,
): node is ESTree.StringLiteral | ESTree.TemplateLiteral {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return true;
  }
  return node?.type === 'TemplateLiteral' && node.expressions.length === 0;
}

export function isReadonlyStringLiteralCatalog(
  node: ESTree.Node | null,
): node is ESTree.TSAsExpression {
  return (
    node?.type === 'TSAsExpression' &&
    node.expression.type === 'ArrayExpression' &&
    node.expression.elements.length > 0 &&
    node.expression.elements.every((element) => isStaticString(element)) &&
    node.typeAnnotation.type === 'TSTypeReference' &&
    node.typeAnnotation.typeName.type === 'Identifier' &&
    node.typeAnnotation.typeName.name === 'const' &&
    node.typeAnnotation.typeArguments == null
  );
}

export function addIdentifierDeclaratorNames(
  names: Set<string>,
  declaration: ESTree.VariableDeclaration,
  include: (item: ESTree.VariableDeclarator) => boolean = () => true,
): void {
  for (const item of declaration.declarations) {
    if (item.id.type === 'Identifier' && include(item)) {
      names.add(item.id.name);
    }
  }
}

export function topLevelConstDeclaration(
  statement: ESTree.Node,
  mode: 'exported' | 'local',
): ESTree.VariableDeclaration | null {
  const declaration =
    statement.type === 'ExportNamedDeclaration'
      ? statement.declaration
      : mode === 'local'
        ? statement
        : null;
  if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
    return null;
  }
  return declaration;
}

export function isFunctionLike(
  node: ESTree.Node,
): node is ESTree.ArrowFunctionExpression | ESTree.Function {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression'
  );
}

/** Expression body, or the argument of a sole `return`; otherwise null. */
export function directReturnExpression(
  node: ESTree.ArrowFunctionExpression | ESTree.Function,
): ESTree.Expression | null | undefined {
  if (
    node.body?.type === 'BlockStatement' &&
    node.body.body.length === 1 &&
    node.body.body[0]?.type === 'ReturnStatement'
  ) {
    return node.body.body[0].argument;
  }
  if (node.body && node.body.type !== 'BlockStatement') {
    return node.body;
  }
  return null;
}
