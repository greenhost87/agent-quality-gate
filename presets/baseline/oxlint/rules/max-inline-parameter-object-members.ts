import { defineRule, type ESTree, type Options } from '@oxlint/plugins';
import * as v from 'valibot';

import { forEachParamList, paramTypeAnnotation } from 'agent-quality-gate/oxlint-walk';

const DEFAULT_MAX = -1;

const OptionsSchema = v.object({
  max: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.check((value) => value === -1 || value >= 0),
    ),
    DEFAULT_MAX,
  ),
});

function readMax(options: Readonly<Options>): number {
  const parsed = v.safeParse(OptionsSchema, options[0] ?? {});
  if (!parsed.success) {
    return DEFAULT_MAX;
  }
  return parsed.output.max;
}

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
    return {
      before() {
        const max = readMax(context.options);
        if (max < 0) {
          return false;
        }
        forEachParamList(context.sourceCode.ast, (params) => {
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
        });
        return false;
      },
      Program() {},
    };
  },
});
