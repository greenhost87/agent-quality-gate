import { defineRule, type ESTree } from '@oxlint/plugins';

import { paramUnionBeforeVisitors } from 'agent-quality-gate/oxlint-walk';

function isWideNonLiteralUnion(node: ESTree.TSUnionType): boolean {
  const { types } = node;
  if (types.length <= 2) return false;
  for (const type of types) {
    switch (type.type) {
      case 'TSBooleanKeyword':
      case 'TSLiteralType':
      case 'TSNullKeyword':
      case 'TSNumberKeyword':
      case 'TSStringKeyword':
      case 'TSUndefinedKeyword':
        break;
      default:
        return true;
    }
  }
  return false;
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      wideUnion: 'Do not use wide non-literal union types in parameters.',
    },
  },
  createOnce(context) {
    return paramUnionBeforeVisitors(context, 'wideUnion', isWideNonLiteralUnion);
  },
});
