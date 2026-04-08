import { createRule } from '../create-rule.mjs';

export default createRule({
  name: 'no-empty-interface-extends',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow interfaces that only extend another type without adding members.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    ],
    messages: {
      emptyWrapper:
        'Interface "{{name}}" only forwards another type through `extends` and adds no members. Export the base type directly or add real members.',
    },
  },
  defaultOptions: [
    {
      allowNames: [],
    },
  ],
  create(context, [options]) {
    const allowNames = new Set(options.allowNames ?? []);

    return {
      TSInterfaceDeclaration(node) {
        if (allowNames.has(node.id.name)) {
          return;
        }

        if (!node.extends.length) {
          return;
        }

        if (node.body.body.length > 0) {
          return;
        }

        context.report({
          node: node.id,
          messageId: 'emptyWrapper',
          data: {
            name: node.id.name,
          },
        });
      },
    };
  },
});
