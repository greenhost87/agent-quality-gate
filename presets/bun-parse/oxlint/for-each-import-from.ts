import type { ESTree } from '@oxlint/plugins';

import { astIndex } from '../../../scripts/oxlint-walk/ast-index.ts';
import { walkAst } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

export function forEachImportSpecifierFrom(
  root: ESTree.Node,
  moduleSource: string,
  visit: (specifier: ESTree.Node) => void,
): void {
  const visitImport = (node: ESTree.Node): void => {
    if (node.type !== 'ImportDeclaration' || node.source.value !== moduleSource) {
      return;
    }
    for (const specifier of node.specifiers) {
      visit(specifier);
    }
  };

  if (root.type === 'Program') {
    for (const node of astIndex(root).nodesOfType('ImportDeclaration')) {
      visitImport(node);
    }
    return;
  }

  walkAst(root, visitImport);
}
