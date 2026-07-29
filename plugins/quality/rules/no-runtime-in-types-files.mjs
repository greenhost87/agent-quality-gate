import { isTypeOnlyFile } from '../type-only-files.mjs';

function isTypeOnlyDeclaration(node) {
  return (
    Boolean(node?.declare) ||
    node?.type === 'TSInterfaceDeclaration' ||
    node?.type === 'TSTypeAliasDeclaration' ||
    node?.type === 'TSModuleDeclaration' ||
    node?.type === 'TSDeclareFunction'
  );
}

const noRuntimeInTypesFiles = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      invalid: 'Type-only files must contain only type imports, type exports, and type declarations.',
    },
  },
  create(context) {
    if (!isTypeOnlyFile(context.filename)) {
      return {};
    }
    return {
      ImportDeclaration(node) {
        if (node.importKind !== 'type') {
          context.report({ node, messageId: 'invalid' });
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') {
          context.report({ node, messageId: 'invalid' });
        }
      },
      ExportDefaultDeclaration(node) {
        if (!isTypeOnlyDeclaration(node.declaration)) {
          context.report({ node, messageId: 'invalid' });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind !== 'type' && !isTypeOnlyDeclaration(node.declaration)) {
          context.report({ node, messageId: 'invalid' });
        }
      },
      Program(node) {
        for (const statement of node.body) {
          if (
            statement.type !== 'ImportDeclaration' &&
            statement.type !== 'ExportNamedDeclaration' &&
            statement.type !== 'ExportAllDeclaration' &&
            statement.type !== 'ExportDefaultDeclaration' &&
            statement.type !== 'EmptyStatement' &&
            !isTypeOnlyDeclaration(statement)
          ) {
            context.report({ node: statement, messageId: 'invalid' });
          }
        }
      },
    };
  },
};

export default noRuntimeInTypesFiles;
