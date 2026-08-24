import { defineRule, type ESTree } from '@oxlint/plugins';

import { paramUnionBeforeVisitors } from 'agent-quality-gate/oxlint-walk';

function combinesNullAndUndefined(node: ESTree.TSUnionType): boolean {
  let hasNull = false;
  let hasUndefined = false;
  for (const type of node.types) {
    if (type.type === 'TSNullKeyword') {
      hasNull = true;
    } else if (type.type === 'TSUndefinedKeyword') {
      hasUndefined = true;
    }
    if (hasNull && hasUndefined) {
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
      nullUndefined: 'Do not combine null and undefined in parameter types.',
    },
  },
  createOnce(context) {
    return paramUnionBeforeVisitors(context, 'nullUndefined', combinesNullAndUndefined);
  },
});
