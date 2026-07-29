import { createParameterUnionRule } from '../parameter-union-rule.mjs';

function combinesNullAndUndefined(node) {
  const hasNull = node.types.some((type) => type.type === 'TSNullKeyword');
  const hasUndefined = node.types.some((type) => type.type === 'TSUndefinedKeyword');
  return hasNull && hasUndefined;
}

export default createParameterUnionRule(
  'nullUndefined',
  'Do not combine null and undefined in parameter types.',
  combinesNullAndUndefined
);
