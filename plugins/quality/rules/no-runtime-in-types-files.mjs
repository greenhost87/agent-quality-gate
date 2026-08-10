import { isReadonlyStringLiteralCatalog } from '../ast.mjs';
import { isTypeOnlyFile } from '../type-only-files.mjs';

function isExportedReadonlyStringLiteralCatalog(node) {
  const declaration = node?.type === 'ExportNamedDeclaration' ? node.declaration : null;
  return (
    declaration?.type === 'VariableDeclaration' &&
    declaration.kind === 'const' &&
    declaration.declarations.every(
      (item) =>
        item.id.type === 'Identifier' &&
        item.id.typeAnnotation == null &&
        isReadonlyStringLiteralCatalog(item.init)
    )
  );
}

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
      invalid:
        'Dedicated type files may contain only type imports, type exports, type declarations, and exported unannotated "as const" string literal catalogs.',
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
        if (
          node.exportKind !== 'type' &&
          !isTypeOnlyDeclaration(node.declaration) &&
          !isExportedReadonlyStringLiteralCatalog(node)
        ) {
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
