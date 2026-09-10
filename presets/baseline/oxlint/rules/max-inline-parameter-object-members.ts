import { defineRule, type ESTree } from '@oxlint/plugins';

import { createMaxOptionReader } from '../max-option.ts';

import { functionParamVisitors, paramTypeAnnotation } from 'agent-quality-gate/oxlint-walk';

import { createOptionsRefCache } from '../../../../scripts/oxlint-options-ref-cache/options-ref-cache.ts';

const DEFAULT_MAX = -1;

const readMax = createMaxOptionReader(DEFAULT_MAX, -1);

function nextAnnotatedParam(param: ESTree.Node): ESTree.Node | null {
  if (param.type === 'AssignmentPattern') {
    return param.left;
  }
  if (param.type === 'RestElement') {
    return param.argument;
  }
  if (param.type === 'TSParameterProperty') {
    return param.parameter;
  }
  return null;
}

function inlineParameterObjectType(param: ESTree.Node): ESTree.TSTypeLiteral | null {
  let current = param;
  const seen = new Set<ESTree.Node>();
  for (;;) {
    if (seen.has(current)) {
      return null;
    }
    seen.add(current);
    const typeNode = paramTypeAnnotation(current);
    if (typeNode?.type === 'TSTypeLiteral') {
      return typeNode;
    }
    const next = nextAnnotatedParam(current);
    if (next === null) {
      return null;
    }
    current = next;
  }
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          max: { type: 'integer' },
        },
      },
    ],
    messages: {
      tooManyMembers:
        'Do not use inline object types with more than {{max}} members in parameters.',
    },
  },
  createOnce(context) {
    const maxCache = createOptionsRefCache(readMax);
    let max = DEFAULT_MAX;
    return {
      before() {
        max = maxCache.get(context.options);
        if (max < 0) {
          return false;
        }
        return undefined;
      },
      ...functionParamVisitors((params) => {
        for (const param of params) {
          const typeNode = inlineParameterObjectType(param);
          if (typeNode != null && typeNode.members.length > max) {
            context.report({
              node: typeNode,
              messageId: 'tooManyMembers',
              data: { max: String(max) },
            });
          }
        }
      }),
    };
  },
});
