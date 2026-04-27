import { createRule } from '../create-rule.mjs';

export default createRule({
  name: 'no-useless-exported-type-alias',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow exported type aliases that only rename another named type.',
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
          allowTargetNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    ],
    messages: {
      uselessAlias:
        'Exported type alias "{{aliasName}}" only renames "{{targetName}}". Export the original type directly or add real semantics.',
    },
  },
  defaultOptions: [
    {
      allowNames: [],
      allowTargetNames: [],
    },
  ],
  create(context, [options]) {
    const allowNames = new Set(options.allowNames ?? []);
    const allowTargetNames = new Set(options.allowTargetNames ?? []);

    return {
      'ExportNamedDeclaration > TSTypeAliasDeclaration'(node) {
        if (allowNames.has(node.id.name)) {
          return;
        }

        const annotation = node.typeAnnotation;

        if (annotation.type !== 'TSTypeReference') {
          return;
        }

        const typeArguments = annotation.typeArguments ?? annotation.typeParameters;
        if (typeArguments?.params?.length) {
          return;
        }

        if (annotation.typeName.type !== 'Identifier') {
          return;
        }

        const targetName = annotation.typeName.name;

        if (allowTargetNames.has(targetName)) {
          return;
        }

        context.report({
          node: node.id,
          messageId: 'uselessAlias',
          data: {
            aliasName: node.id.name,
            targetName,
          },
        });
      },
    };
  },
});
