import { type Context, type ESTree, type Variable } from '@oxlint/plugins';

import {
  importSource,
  isTypeOnlyImport,
  isTypeOnlySpecifier,
  productionDaoBindingImportPattern,
} from './dao-boundaries-shared.ts';
import {
  astParentOf,
  unwrapExpression,
  walkAstSkippingTypeAndJsxMarkup,
} from '../../../scripts/oxlint-walk/oxlint-walk.ts';

const expressionWrapperTypes = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function isProductionDaoSource(source: string | null): source is string {
  return (
    source !== null &&
    productionDaoBindingImportPattern.test(source) &&
    !source.includes('.dao.types')
  );
}

function isRuntimeDaoImport(node: ESTree.ImportDeclaration): boolean {
  return (
    isProductionDaoSource(importSource(node)) &&
    !isTypeOnlyImport(node) &&
    node.specifiers.some((specifier) => !isTypeOnlySpecifier(specifier))
  );
}

function isRuntimeDaoReexport(
  node: ESTree.ExportAllDeclaration | ESTree.ExportNamedDeclaration,
): boolean {
  const source = node.source && typeof node.source.value === 'string' ? node.source.value : null;
  if (!isProductionDaoSource(source) || node.exportKind === 'type') {
    return false;
  }
  return (
    node.type === 'ExportAllDeclaration' ||
    node.specifiers.some((specifier) => specifier.exportKind !== 'type')
  );
}

export function programUsesDaoOperations(program: ESTree.Program): boolean {
  return program.body.some(
    (statement) =>
      (statement.type === 'ImportDeclaration' && isRuntimeDaoImport(statement)) ||
      ((statement.type === 'ExportAllDeclaration' || statement.type === 'ExportNamedDeclaration') &&
        isRuntimeDaoReexport(statement)),
  );
}

function runtimeImportKind(node: ESTree.ImportDeclaration, name: string): DaoImportKind | null {
  if (isTypeOnlyImport(node)) {
    return null;
  }
  const specifier = node.specifiers.find((candidate) => candidate.local.name === name);
  if (!specifier || isTypeOnlySpecifier(specifier)) {
    return null;
  }
  return specifier.type === 'ImportNamespaceSpecifier' ? 'namespace' : 'named';
}

function collectDaoImportBindings(
  context: Context,
  program: ESTree.Program,
): Map<Variable, DaoImportKind> {
  const bindings = new Map<Variable, DaoImportKind>();
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    if (!isProductionDaoSource(importSource(statement))) {
      continue;
    }
    for (const variable of context.sourceCode.getDeclaredVariables(statement)) {
      const kind = runtimeImportKind(statement, variable.name);
      if (kind !== null) {
        bindings.set(variable, kind);
      }
    }
  }
  return bindings;
}

function wrappedBy(parent: ESTree.Node, child: ESTree.Node): boolean {
  return (
    expressionWrapperTypes.has(parent.type) && 'expression' in parent && parent.expression === child
  );
}

function isDirectCallTarget(node: ESTree.Node): boolean {
  let current = node;
  while (current.parent && wrappedBy(current.parent, current)) {
    current = current.parent;
  }
  return current.parent?.type === 'CallExpression' && current.parent.callee === current;
}

function namespaceReferenceIsDirectCall(node: ESTree.Node): boolean {
  if (node.type !== 'Identifier') {
    return false;
  }
  const member = node.parent;
  return (
    member.type === 'MemberExpression' &&
    member.object === node &&
    !member.computed &&
    member.property.type === 'Identifier' &&
    isDirectCallTarget(member)
  );
}

function namespaceReferenceIsTestSpyTarget(node: ESTree.Node, isTestFile: boolean): boolean {
  if (!isTestFile || node.type !== 'Identifier') {
    return false;
  }
  const call = node.parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments[0] === node &&
    call.callee.type === 'Identifier' &&
    call.callee.name === 'spyOn'
  );
}

function enclosingObject(node: ESTree.Node): ESTree.ObjectExpression | null {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'ObjectExpression') {
      return current;
    }
  }
  return null;
}

function reportOnce(
  context: Context,
  reported: Set<ESTree.Node>,
  node: ESTree.Node,
  messageId: string,
): void {
  if (reported.has(node)) {
    return;
  }
  reported.add(node);
  context.report({ node, messageId });
}

function reportInvalidDaoBindingReferences(
  context: Context,
  bindings: ReadonlyMap<Variable, DaoImportKind>,
  reported: Set<ESTree.Node>,
  isTestFile: boolean,
): void {
  for (const [variable, kind] of bindings) {
    for (const reference of variable.references) {
      const identifier = reference.identifier;
      const valid =
        kind === 'namespace'
          ? namespaceReferenceIsDirectCall(identifier) ||
            namespaceReferenceIsTestSpyTarget(identifier, isTestFile)
          : isDirectCallTarget(identifier);
      if (valid) {
        continue;
      }
      reportOnce(context, reported, enclosingObject(identifier) ?? identifier, 'daoOperationValue');
    }
  }
}

function reportRuntimeDaoReexports(
  context: Context,
  program: ESTree.Program,
  reported: Set<ESTree.Node>,
): void {
  for (const statement of program.body) {
    if (statement.type !== 'ExportAllDeclaration' && statement.type !== 'ExportNamedDeclaration') {
      continue;
    }
    const source =
      statement.source && typeof statement.source.value === 'string'
        ? statement.source.value
        : null;
    if (!isProductionDaoSource(source) || statement.exportKind === 'type') {
      continue;
    }
    if (
      statement.type === 'ExportNamedDeclaration' &&
      statement.specifiers.length > 0 &&
      statement.specifiers.every((specifier) => specifier.exportKind === 'type')
    ) {
      continue;
    }
    reportOnce(context, reported, statement.source ?? statement, 'daoOperationValue');
  }
}

function declaredVariable(context: Context, node: ESTree.Node, name: string): Variable | undefined {
  return context.sourceCode.getDeclaredVariables(node).find((candidate) => candidate.name === name);
}

function functionBinding(context: Context, node: ESTree.Node): FunctionBinding | null {
  if (node.type === 'FunctionDeclaration' && node.id) {
    const variable = declaredVariable(context, node, node.id.name);
    return variable ? { node, variable } : null;
  }
  if (
    node.type === 'VariableDeclarator' &&
    node.id.type === 'Identifier' &&
    node.init &&
    (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
  ) {
    const variable = declaredVariable(context, node, node.id.name);
    return variable ? { node: node.init, variable } : null;
  }
  return null;
}

export function collectFunctionBinding(
  context: Context,
  node: ESTree.Node,
): FunctionBinding | null {
  return functionBinding(context, node);
}

function collectFunctionBindings(context: Context, program: ESTree.Program): FunctionBinding[] {
  const bindings: FunctionBinding[] = [];
  walkAstSkippingTypeAndJsxMarkup(program, (node) => {
    const binding = functionBinding(context, node);
    if (binding) {
      bindings.push(binding);
    }
  });
  return bindings;
}

function referenceIsInside(root: ESTree.Node, identifier: ESTree.Node): boolean {
  for (
    let current: ESTree.Node | null = identifier;
    current != null;
    current = astParentOf(current)
  ) {
    if (current === root) {
      return true;
    }
  }
  return false;
}

function subtreeContainsReference(
  root: ESTree.Node,
  references: ReadonlySet<ESTree.Node>,
): boolean {
  for (const reference of references) {
    if (referenceIsInside(root, reference)) {
      return true;
    }
  }
  return false;
}

function daoBackedReferenceNodes(
  daoBindings: ReadonlyMap<Variable, DaoImportKind>,
  functions: readonly FunctionBinding[],
): Set<ESTree.Node> {
  const references = new Set<ESTree.Node>();
  for (const variable of daoBindings.keys()) {
    for (const reference of variable.references) {
      references.add(reference.identifier);
    }
  }
  const taintedFunctions = new Set<Variable>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of functions) {
      if (
        taintedFunctions.has(candidate.variable) ||
        !subtreeContainsReference(candidate.node, references)
      ) {
        continue;
      }
      taintedFunctions.add(candidate.variable);
      for (const reference of candidate.variable.references) {
        references.add(reference.identifier);
      }
      changed = true;
    }
  }
  return references;
}

function addNamedExports(names: Set<string>, statement: ESTree.ExportNamedDeclaration): void {
  if (statement.source !== null) {
    return;
  }
  if (statement.declaration?.type === 'VariableDeclaration') {
    for (const declaration of statement.declaration.declarations) {
      if (declaration.id.type === 'Identifier') {
        names.add(declaration.id.name);
      }
    }
    return;
  }
  for (const specifier of statement.specifiers) {
    if (specifier.local.type === 'Identifier') {
      names.add(specifier.local.name);
    }
  }
}

function addDefaultExport(
  names: Set<string>,
  objects: ESTree.ObjectExpression[],
  statement: ESTree.ExportDefaultDeclaration,
): void {
  if (statement.declaration.type === 'Identifier') {
    names.add(statement.declaration.name);
    return;
  }
  const declaration = unwrapExpression(statement.declaration);
  if (declaration.type === 'ObjectExpression') {
    objects.push(declaration);
  }
}

function topLevelVariableDeclaration(
  statement: ESTree.Statement,
): ESTree.VariableDeclaration | null {
  const declaration =
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
  return declaration?.type === 'VariableDeclaration' ? declaration : null;
}

function exportedObjectInitializer(
  item: ESTree.VariableDeclarator,
  exportedNames: ReadonlySet<string>,
): ESTree.ObjectExpression | null {
  if (item.id.type !== 'Identifier' || !exportedNames.has(item.id.name) || !item.init) {
    return null;
  }
  const initializer = unwrapExpression(item.init);
  return initializer.type === 'ObjectExpression' ? initializer : null;
}

function exportedObjectRoots(program: ESTree.Program): ESTree.ObjectExpression[] {
  const exportedNames = new Set<string>();
  const directObjects: ESTree.ObjectExpression[] = [];
  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      addNamedExports(exportedNames, statement);
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      addDefaultExport(exportedNames, directObjects, statement);
    }
  }
  for (const statement of program.body) {
    const declaration = topLevelVariableDeclaration(statement);
    if (declaration) {
      for (const item of declaration.declarations) {
        const object = exportedObjectInitializer(item, exportedNames);
        if (object) {
          directObjects.push(object);
        }
      }
    }
  }
  return directObjects;
}

function reportExportedDaoFacades(
  context: Context,
  program: ESTree.Program,
  bindings: ReadonlyMap<Variable, DaoImportKind>,
  reported: Set<ESTree.Node>,
  functionBindings: readonly FunctionBinding[],
): void {
  if (bindings.size === 0) {
    return;
  }
  const references = daoBackedReferenceNodes(bindings, functionBindings);
  for (const object of exportedObjectRoots(program)) {
    if (subtreeContainsReference(object, references)) {
      reportOnce(context, reported, object, 'daoOperationFacade');
    }
  }
}

export function inspectDaoOperationUsage(
  context: Context,
  program: ESTree.Program,
  isTestFile: boolean,
  functionBindings: readonly FunctionBinding[] = collectFunctionBindings(context, program),
): void {
  const reported = new Set<ESTree.Node>();
  const bindings = collectDaoImportBindings(context, program);
  reportInvalidDaoBindingReferences(context, bindings, reported, isTestFile);
  reportRuntimeDaoReexports(context, program, reported);
  reportExportedDaoFacades(context, program, bindings, reported, functionBindings);
}

export const daoImportKinds = ['named', 'namespace'] as const;

export type DaoImportKind = (typeof daoImportKinds)[number];

export type FunctionBinding = {
  node: ESTree.ArrowFunctionExpression | ESTree.Function;
  variable: Variable;
};
