import type { ESTree } from '@oxlint/plugins';

/** Static member name for `obj.name` and `obj['name']`; null for computed dynamics. */
export function staticMemberName(node: ESTree.Node, computed: boolean): string | null {
  if (!computed && node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}
