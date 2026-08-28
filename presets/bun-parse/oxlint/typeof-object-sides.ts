import type { ESTree } from '@oxlint/plugins';

export function typeofCompareSides(node: BinarySides): {
  typeofNode: ESTree.UnaryExpression;
  literal: ESTree.Node;
} | null {
  if (node.left.type === 'UnaryExpression') {
    return { typeofNode: node.left, literal: node.right };
  }
  if (node.right.type === 'UnaryExpression') {
    return { typeofNode: node.right, literal: node.left };
  }
  return null;
}

export function isTypeofObjectLiteral(node: BinarySides): boolean {
  const sides = typeofCompareSides(node);
  return (
    sides?.typeofNode.operator === 'typeof' &&
    sides.literal.type === 'Literal' &&
    'value' in sides.literal &&
    sides.literal.value === 'object'
  );
}

export type BinarySides = {
  left: ESTree.Node;
  right: ESTree.Node;
};
