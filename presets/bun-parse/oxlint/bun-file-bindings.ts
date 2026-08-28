import { type Context, type ESTree, type Scope, type Variable } from '@oxlint/plugins';

import {
  unwrapExpression,
  walkAstSkippingTypeAndJsxMarkup,
} from '../../../scripts/oxlint-walk/oxlint-walk.ts';
import { importedName } from './import-specifier-name.ts';
import { memberName } from './member-name.ts';

function variableForName(scope: Scope, name: string): Variable | undefined {
  for (let current: Scope | null = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable != null) {
      return variable;
    }
  }
  return undefined;
}

function identifierVariable(context: Context, node: ESTree.Node): Variable | undefined {
  if (node.type !== 'Identifier') {
    return undefined;
  }
  return variableForName(context.sourceCode.getScope(node), node.name);
}

function isUnshadowedBun(context: Context, node: ESTree.Expression): boolean {
  const unwrapped = unwrapExpression(node);
  return (
    unwrapped.type === 'Identifier' &&
    unwrapped.name === 'Bun' &&
    identifierVariable(context, unwrapped) == null
  );
}

function isBunFileCall(context: Context, node: ESTree.Node): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const callee = unwrapExpression(node.callee);
  return (
    callee.type === 'MemberExpression' &&
    memberName(callee) === 'file' &&
    isUnshadowedBun(context, callee.object)
  );
}

function isImportedBunFileCall(
  context: Context,
  node: ESTree.CallExpression,
  factories: ReadonlySet<Variable>,
): boolean {
  const callee = unwrapExpression(node.callee);
  if (callee.type !== 'Identifier') {
    return false;
  }
  const variable = identifierVariable(context, callee);
  return variable != null && factories.has(variable);
}

export function isBunFileFactoryCall(
  context: Context,
  node: ESTree.Node,
  bindings: BunFileBindings,
): node is ESTree.CallExpression {
  return (
    node.type === 'CallExpression' &&
    (isBunFileCall(context, node) || isImportedBunFileCall(context, node, bindings.factories))
  );
}

export function createEmptyBunFileBindings(): BunFileBindings {
  return { factories: new Set(), files: new Set() };
}

export function noteBunFileImport(
  context: Context,
  specifier: ESTree.Node,
  bindings: BunFileBindings,
): void {
  if (specifier.type !== 'ImportSpecifier' || importedName(specifier) !== 'file') {
    return;
  }
  const variable = identifierVariable(context, specifier.local);
  if (variable != null) {
    bindings.factories.add(variable);
  }
}

export function noteConstBunFileBinding(
  context: Context,
  node: ESTree.VariableDeclarator,
  parent: ESTree.Node | null,
  bindings: BunFileBindings,
): void {
  if (
    node.id.type !== 'Identifier' ||
    node.init == null ||
    parent?.type !== 'VariableDeclaration' ||
    parent.kind !== 'const' ||
    !isBunFileFactoryCall(context, unwrapExpression(node.init), bindings)
  ) {
    return;
  }
  const variable = identifierVariable(context, node.id);
  if (variable != null) {
    bindings.files.add(variable);
  }
}

/** Collects imported `file` factories and `const` values initialized from Bun file factories. */
export function collectBunFileBindings(context: Context, root: ESTree.Node): BunFileBindings {
  const bindings = createEmptyBunFileBindings();
  walkAstSkippingTypeAndJsxMarkup(root, (node, parent) => {
    if (node.type === 'ImportDeclaration' && node.source.value === 'bun') {
      for (const specifier of node.specifiers) {
        noteBunFileImport(context, specifier, bindings);
      }
    }
    if (node.type === 'VariableDeclarator') {
      noteConstBunFileBinding(context, node, parent, bindings);
    }
  });
  return bindings;
}

/** True when `identifier` refers to a `const` initialized from a Bun file factory. */
export function isConstBunFileBinding(
  context: Context,
  identifier: ESTree.Node,
  bindings: BunFileBindings,
): boolean {
  const variable = identifierVariable(context, identifier);
  return variable != null && bindings.files.has(variable);
}

export type BunFileBindings = {
  factories: Set<Variable>;
  files: Set<Variable>;
};
