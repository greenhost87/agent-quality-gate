import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../create-rule.mjs';
import { matchesAny, normalizePath } from '../glob-utils.mjs';

export default createRule({
  name: 'no-record-string-unknown',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow raw Record<string, unknown> in domain/runtime code in favor of precise payload types.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowIn: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    ],
    messages: {
      noOpenPayload:
        'Avoid `Record<string, unknown>` here. Introduce a precise payload/interface/union instead of an open bag of fields.',
    },
  },
  defaultOptions: [
    {
      allowIn: [],
    },
  ],
  create(context, [options]) {
    const filename = normalizePath(String(context.filename ?? '<input>'));

    if (filename !== '<input>' && filename !== '<text>' && matchesAny(filename, options.allowIn ?? [])) {
      return {};
    }

    return {
      TSTypeReference(node) {
        if (node.typeName.type !== AST_NODE_TYPES.Identifier || node.typeName.name !== 'Record') {
          return;
        }

        const typeArguments = node.typeArguments ?? node.typeParameters;
        if (!typeArguments || typeArguments.params.length !== 2) {
          return;
        }

        const [keyType, valueType] = typeArguments.params;

        if (keyType.type === AST_NODE_TYPES.TSStringKeyword && valueType.type === AST_NODE_TYPES.TSUnknownKeyword) {
          context.report({
            node,
            messageId: 'noOpenPayload',
          });
        }
      },
    };
  },
});
