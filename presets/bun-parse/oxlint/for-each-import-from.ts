import type { ESTree } from '@oxlint/plugins';

import { walkAst } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

export function forEachImportSpecifierFrom(
  root: ESTree.Node,
  moduleSource: string,
  visit: (specifier: ESTree.Node) => void,
): void {
  walkAst(root, (node) => {
    if (node.type !== 'ImportDeclaration' || node.source.value !== moduleSource) {
      return;
    }
    for (const specifier of node.specifiers) {
      visit(specifier);
    }
  });
}
