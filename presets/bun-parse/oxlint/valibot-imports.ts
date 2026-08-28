import type { ESTree } from '@oxlint/plugins';

import { forEachImportSpecifierFrom } from './for-each-import-from.ts';

export function forEachValibotImportSpecifier(
  root: ESTree.Node,
  visit: (specifier: ESTree.Node) => void,
): void {
  forEachImportSpecifierFrom(root, 'valibot', visit);
}
