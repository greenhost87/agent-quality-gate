import { createRule } from '../create-rule.mjs';
import { matchesAny, normalizePath } from '../glob-utils.mjs';

const DEFAULT_TYPE_FILE_PATTERNS = ['**/*.types.ts', '**/*.contracts.ts', '**/*.interfaces.ts'];

function isTypeOnlyDeclaration(node) {
  if (!node) {
    return false;
  }

  if (node.declare === true) {
    return true;
  }

  return (
    node.type === 'TSInterfaceDeclaration' ||
    node.type === 'TSTypeAliasDeclaration' ||
    node.type === 'TSModuleDeclaration' ||
    node.type === 'TSDeclareFunction'
  );
}

function statementKind(statement) {
  if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
    return statement.declaration.type;
  }

  return statement.type;
}

export default createRule({
  name: 'no-runtime-in-types-files',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow runtime code from living in dedicated type files.',
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
      runtimeStatement:
        'Type-only file "{{file}}" contains runtime top-level statement "{{statement}}". Keep only type declarations, `import type`, and `export type` here.',
      valueImport: 'Type-only file "{{file}}" must not import runtime values. Use `import type` only.',
      valueExport: 'Type-only file "{{file}}" must not export runtime values. Use `export type` only.',
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

    if (!matchesAny(filename, typeFilePatterns)) {
      return {};
    }

    const shortFile = filename.split('/').at(-1) ?? filename;

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') {
          return;
        }

        context.report({
          node,
          messageId: 'valueImport',
          data: {
            file: shortFile,
          },
        });
      },

      ExportNamedDeclaration(node) {
        if (node.exportKind === 'type') {
          return;
        }

        if (isTypeOnlyDeclaration(node.declaration)) {
          return;
        }

        context.report({
          node,
          messageId: 'valueExport',
          data: {
            file: shortFile,
          },
        });
      },

      ExportAllDeclaration(node) {
        if (node.exportKind === 'type') {
          return;
        }

        context.report({
          node,
          messageId: 'valueExport',
          data: {
            file: shortFile,
          },
        });
      },

      Program(node) {
        for (const statement of node.body) {
          if (
            statement.type === 'ImportDeclaration' ||
            statement.type === 'ExportNamedDeclaration' ||
            statement.type === 'ExportAllDeclaration' ||
            statement.type === 'TSInterfaceDeclaration' ||
            statement.type === 'TSTypeAliasDeclaration' ||
            statement.type === 'TSModuleDeclaration' ||
            statement.type === 'TSDeclareFunction' ||
            statement.type === 'EmptyStatement'
          ) {
            continue;
          }

          if (statement.declare === true) {
            continue;
          }

          context.report({
            node: statement,
            messageId: 'runtimeStatement',
            data: {
              file: shortFile,
              statement: statementKind(statement),
            },
          });
        }
      },
    };
  },
});
