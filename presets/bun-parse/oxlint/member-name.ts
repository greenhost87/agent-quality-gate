import type { ESTree } from '@oxlint/plugins';

export function memberName(node: ESTree.MemberExpression): string | null {
  if (node.computed) return null;
  return node.property.type === 'Identifier' ? node.property.name : null;
}
