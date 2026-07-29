import { createParameterUnionRule } from '../parameter-union-rule.mjs';

const literalTypes = new Set([
  'TSBooleanKeyword',
  'TSLiteralType',
  'TSNullKeyword',
  'TSNumberKeyword',
  'TSStringKeyword',
  'TSUndefinedKeyword',
]);

function isWideNonLiteralUnion(node) {
  return node.types.length > 2 && !node.types.every((type) => literalTypes.has(type.type));
}

export default createParameterUnionRule(
  'wideUnion',
  'Do not use wide non-literal union types in parameters.',
  isWideNonLiteralUnion
);
