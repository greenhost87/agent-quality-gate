import { createRule } from '../create-rule.mjs';
import { matchesAny, normalizePath } from '../glob-utils.mjs';

const DEFAULT_TYPE_FILE_PATTERNS = ['**/*.types.ts', '**/*.contracts.ts', '**/*.interfaces.ts', '**/types.ts'];

export default createRule({
  name: 'no-type-declarations-in-runtime-files',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow type and interface declarations in runtime implementation files.',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          typeFilePatterns: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    ],
    messages: {
      moveType: 'Move {{kind}} "{{name}}" into a dedicated type file (*.types.ts | *.contracts.ts | *.interfaces.ts).',
    },
  },
  defaultOptions: [
    {
      typeFilePatterns: DEFAULT_TYPE_FILE_PATTERNS,
    },
  ],
  create(context, [options]) {
    const filename = normalizePath(String(context.filename ?? '<input>'));
    const typeFilePatterns = options.typeFilePatterns ?? DEFAULT_TYPE_FILE_PATTERNS;

    if (filename === '<input>' || filename === '<text>') {
      return {};
    }

    if (filename.endsWith('/types.ts') || matchesAny(filename, typeFilePatterns)) {
      return {};
    }

    function report(node, kind, name) {
      context.report({
        node: node.id ?? node,
        messageId: 'moveType',
        data: {
          kind,
          name,
        },
      });
    }

    return {
      TSInterfaceDeclaration(node) {
        report(node, 'interface', node.id.name);
      },
      TSTypeAliasDeclaration(node) {
        report(node, 'type', node.id.name);
      },
    };
  },
});
