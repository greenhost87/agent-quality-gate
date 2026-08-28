import type { ESTree } from '@oxlint/plugins';

import { astParentOf, unwrapExpression } from '../../../scripts/oxlint-walk/oxlint-walk.ts';
import {
  collectParseValibotBindings,
  noteParseValibotImportSpecifier,
  type ParseValibotBindings,
} from './valibot-bindings.ts';
import { memberName } from './member-name.ts';

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
]);

const RAW_VALUE_WRAPPERS = new Set([
  'AwaitExpression',
  'ChainExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

export function noteValibotBindingsFromImport(
  node: ESTree.ImportDeclaration,
  bindings: ParseValibotBindings,
): void {
  if (node.source.value !== 'valibot') {
    return;
  }
  for (const specifier of node.specifiers) {
    noteParseValibotImportSpecifier(specifier, bindings);
  }
}

export function collectValibotBindings(root: ESTree.Node): ParseValibotBindings {
  return collectParseValibotBindings(root);
}

export function isValibotParseCall(
  node: ESTree.CallExpression,
  bindings: ParseValibotBindings,
): boolean {
  const callee = unwrapExpression(node.callee);
  if (callee.type === 'Identifier') {
    return bindings.named.has(callee.name);
  }
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return false;
  }
  const object = unwrapExpression(callee.object);
  const method = memberName(callee);
  return (
    object.type === 'Identifier' &&
    bindings.namespaces.has(object.name) &&
    (method === 'parse' || method === 'safeParse')
  );
}

function enclosingFunction(node: ESTree.Node): ESTree.Node | null {
  for (let current = astParentOf(node); current != null; current = astParentOf(current)) {
    if (FUNCTION_TYPES.has(current.type)) {
      return current;
    }
  }
  return null;
}

export function isValidationInput(node: ESTree.Node, bindings: ParseValibotBindings): boolean {
  let current = node;
  for (;;) {
    const parent = astParentOf(current);
    if (parent == null) {
      return false;
    }
    if (parent.type === 'CallExpression') {
      return parent.arguments[1] === current && isValibotParseCall(parent, bindings);
    }
    if (!RAW_VALUE_WRAPPERS.has(parent.type)) {
      return false;
    }
    current = parent;
  }
}

function rawVariable(node: ESTree.CallExpression): ESTree.VariableDeclarator | null {
  let current: ESTree.Node = node;
  for (;;) {
    const parent = astParentOf(current);
    if (parent?.type === 'VariableDeclarator') {
      return parent.init === current && parent.id.type === 'Identifier' ? parent : null;
    }
    if (parent == null || !RAW_VALUE_WRAPPERS.has(parent.type)) {
      return null;
    }
    current = parent;
  }
}

function isDeclarationIdentifier(node: ESTree.Node): boolean {
  const parent = astParentOf(node);
  return parent?.type === 'VariableDeclarator' && parent.id === node;
}

export type RawJsonTrackEntry = {
  initCall: ESTree.CallExpression;
  declaration: ESTree.VariableDeclarator;
  owner: ESTree.Node | null;
  sawValidation: boolean;
  escaped: boolean;
};

export type RawJsonValidationTracker = {
  byName: Map<string, RawJsonTrackEntry[]>;
};

export function createRawJsonValidationTracker(): RawJsonValidationTracker {
  return { byName: new Map() };
}

/** Queue const-bound Bun JSON for usage tracking; returns false when not a const initializer. */
export function registerDeferredRawJsonValidation(
  tracker: RawJsonValidationTracker,
  call: ESTree.CallExpression,
): boolean {
  const declaration = rawVariable(call);
  if (declaration?.id.type !== 'Identifier') {
    return false;
  }
  const entry: RawJsonTrackEntry = {
    initCall: call,
    declaration,
    owner: enclosingFunction(call),
    sawValidation: false,
    escaped: false,
  };
  const name = declaration.id.name;
  const entries = tracker.byName.get(name);
  if (entries === undefined) {
    tracker.byName.set(name, [entry]);
  } else {
    entries.push(entry);
  }
  return true;
}

export function noteTrackedRawJsonIdentifier(
  node: ESTree.Node,
  bindings: ParseValibotBindings,
  tracker: RawJsonValidationTracker,
): void {
  if (node.type !== 'Identifier') {
    return;
  }
  const entries = tracker.byName.get(node.name);
  if (entries === undefined) {
    return;
  }
  for (const entry of entries) {
    if (entry.escaped) {
      continue;
    }
    if (node === entry.declaration.id || isDeclarationIdentifier(node)) {
      continue;
    }
    if (enclosingFunction(node) !== entry.owner) {
      continue;
    }
    if (isValidationInput(node, bindings)) {
      entry.sawValidation = true;
    } else {
      entry.escaped = true;
    }
  }
}

export function isDeferredRawJsonValidated(entry: RawJsonTrackEntry): boolean {
  return entry.sawValidation && !entry.escaped;
}

export function trackedRawJsonEntries(tracker: RawJsonValidationTracker): RawJsonTrackEntry[] {
  const entries: RawJsonTrackEntry[] = [];
  for (const group of tracker.byName.values()) {
    entries.push(...group);
  }
  return entries;
}
