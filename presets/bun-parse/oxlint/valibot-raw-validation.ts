import type { ESTree } from '@oxlint/plugins';

import { type AstParentOf, unwrapExpression } from '../../../scripts/oxlint-walk/oxlint-walk.ts';
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

function enclosingFunction(node: ESTree.Node, parentOf: AstParentOf): ESTree.Node | null {
  for (let current = parentOf(node); current != null; current = parentOf(current)) {
    if (FUNCTION_TYPES.has(current.type)) {
      return current;
    }
  }
  return null;
}

export function isValidationInput(
  node: ESTree.Node,
  bindings: ParseValibotBindings,
  parentOf: AstParentOf,
): boolean {
  let current = node;
  for (;;) {
    const parent = parentOf(current);
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

function rawVariable(
  node: ESTree.CallExpression,
  parentOf: AstParentOf,
): ESTree.VariableDeclarator | null {
  let current: ESTree.Node = node;
  for (;;) {
    const parent = parentOf(current);
    if (parent?.type === 'VariableDeclarator') {
      return parent.init === current && parent.id.type === 'Identifier' ? parent : null;
    }
    if (parent == null || !RAW_VALUE_WRAPPERS.has(parent.type)) {
      return null;
    }
    current = parent;
  }
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
  parentOf: AstParentOf,
): boolean {
  const declaration = rawVariable(call, parentOf);
  if (declaration?.id.type !== 'Identifier') {
    return false;
  }
  const entry: RawJsonTrackEntry = {
    initCall: call,
    declaration,
    owner: enclosingFunction(call, parentOf),
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
  parentOf: AstParentOf,
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
    const parent = parentOf(node);
    if (parent?.type === 'VariableDeclarator' && parent.id === node) {
      continue;
    }
    if (enclosingFunction(node, parentOf) !== entry.owner) {
      continue;
    }
    if (isValidationInput(node, bindings, parentOf)) {
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
