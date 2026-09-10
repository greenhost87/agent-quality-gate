import { realpathSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import type { Context, ESTree, Scope, Variable } from '@oxlint/plugins';

import { unwrapExpression } from 'agent-quality-gate/oxlint-walk';

export type TestImportOrigin = {
  source: string;
  members: string[];
  constructed: boolean;
};

import { staticPropertyName } from './ast.ts';

export function isExternalTestModule(source: string, filename: string): boolean {
  if (isBuiltin(source) || source.startsWith('bun:')) {
    return true;
  }
  try {
    const resolved = realpathSync(createRequire(filename).resolve(source)).replaceAll('\\', '/');
    return resolved.includes('/node_modules/');
  } catch {
    // Unknown aliases, computed resolution and missing packages are not proven external.
    return false;
  }
}

function variableAt(context: Context, node: ESTree.Node): Variable | undefined {
  if (node.type !== 'Identifier') {
    return undefined;
  }
  for (let scope: Scope | null = context.sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) {
      return variable;
    }
  }
  return undefined;
}

function collectImportDeclaration(
  context: Context,
  statement: ESTree.ImportDeclaration,
  imports: Map<Variable, TestImportOrigin>,
): void {
  for (const specifier of statement.specifiers) {
    if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue;
    const variable = variableAt(context, specifier.local);
    if (variable === undefined) continue;
    const members =
      specifier.type === 'ImportNamespaceSpecifier'
        ? []
        : [
            specifier.type === 'ImportDefaultSpecifier'
              ? 'default'
              : (staticPropertyName(specifier.imported, false) ?? '*'),
          ];
    imports.set(variable, { source: statement.source.value, members, constructed: false });
  }
}

export function collectTestImports(context: Context): Map<Variable, TestImportOrigin> {
  const imports = new Map<Variable, TestImportOrigin>();
  for (const statement of context.sourceCode.ast.body) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') {
      continue;
    }
    collectImportDeclaration(context, statement, imports);
  }
  return imports;
}

export type TestOriginResolver = {
  context: Context;
  imports: ReadonlyMap<Variable, TestImportOrigin>;
};

function destructuredMember(node: ESTree.VariableDeclarator, name: string): string[] {
  if (node.id.type !== 'ObjectPattern') {
    return [];
  }
  for (const property of node.id.properties) {
    if (
      property.type === 'Property' &&
      property.value.type === 'Identifier' &&
      property.value.name === name
    ) {
      return [staticPropertyName(property.key, property.computed) ?? '*'];
    }
  }
  return ['*'];
}

function localVariableOrigin(
  resolver: TestOriginResolver,
  variable: Variable,
  seen: Set<Variable>,
): TestImportOrigin | undefined {
  for (const definition of variable.defs) {
    const declaration = definition.node;
    if (declaration.type !== 'VariableDeclarator' || declaration.init === null) continue;
    const origin = testImportOrigin(resolver, declaration.init, seen);
    if (origin !== undefined) {
      return {
        ...origin,
        members: [...origin.members, ...destructuredMember(declaration, variable.name)],
      };
    }
  }
  return undefined;
}

export function testImportOrigin(
  resolver: TestOriginResolver,
  expression: ESTree.Node,
  seen = new Set<Variable>(),
): TestImportOrigin | undefined {
  const node = unwrapExpression(expression);
  if (node.type === 'MemberExpression') {
    const origin = testImportOrigin(resolver, node.object, seen);
    return origin === undefined
      ? undefined
      : {
          ...origin,
          members: [...origin.members, staticPropertyName(node.property, node.computed) ?? '*'],
        };
  }
  if (node.type === 'CallExpression' || node.type === 'NewExpression') {
    const origin = testImportOrigin(resolver, node.callee, seen);
    return origin === undefined ? undefined : { ...origin, constructed: true };
  }
  if (node.type !== 'Identifier') {
    return undefined;
  }
  const variable = variableAt(resolver.context, node);
  if (variable === undefined || seen.has(variable)) {
    return undefined;
  }
  seen.add(variable);
  const imported = resolver.imports.get(variable);
  if (imported !== undefined) {
    return imported;
  }
  return localVariableOrigin(resolver, variable, seen);
}
