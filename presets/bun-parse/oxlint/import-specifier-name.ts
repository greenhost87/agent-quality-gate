import type { ESTree } from '@oxlint/plugins';

export function importedName(node: ESTree.ImportSpecifier): string | null {
  if (node.imported.type === 'Identifier') {
    return node.imported.name;
  }
  return typeof node.imported.value === 'string' ? node.imported.value : null;
}
