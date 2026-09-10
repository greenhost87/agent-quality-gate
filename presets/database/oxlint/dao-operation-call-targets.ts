import type { ESTree } from '@oxlint/plugins';

import { type AstParentOf } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

const expressionWrapperTypes = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function wrappedBy(parent: ESTree.Node, child: ESTree.Node): boolean {
  return (
    expressionWrapperTypes.has(parent.type) && 'expression' in parent && parent.expression === child
  );
}

export function isDirectCallTarget(node: ESTree.Node, parentOf: AstParentOf): boolean {
  let child = node;
  let parent = parentOf(child);
  while (parent != null && wrappedBy(parent, child)) {
    child = parent;
    parent = parentOf(child);
  }
  return parent?.type === 'CallExpression' && parent.callee === child;
}

export function namespaceReferenceIsDirectCall(node: ESTree.Node, parentOf: AstParentOf): boolean {
  if (node.type !== 'Identifier') {
    return false;
  }
  const member = parentOf(node);
  return (
    member?.type === 'MemberExpression' &&
    member.object === node &&
    !member.computed &&
    member.property.type === 'Identifier' &&
    isDirectCallTarget(member, parentOf)
  );
}

export function enclosingObject(
  node: ESTree.Node,
  parentOf: AstParentOf,
): ESTree.ObjectExpression | null {
  for (let current = parentOf(node); current; current = parentOf(current)) {
    if (current.type === 'ObjectExpression') {
      return current;
    }
  }
  return null;
}
