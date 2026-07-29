import { declarationNode } from '../ast.mjs';
import { isTypeOnlyFile } from '../type-only-files.mjs';

function topLevelTypeDeclaration(statement) {
  const declaration = declarationNode(statement);
  return declaration?.type === 'TSInterfaceDeclaration' || declaration?.type === 'TSTypeAliasDeclaration';
}

function runtimeStatement(statement) {
  if (statement.type === 'ImportDeclaration') {
    return (
      statement.importKind !== 'type' &&
      (statement.specifiers.length === 0 || statement.specifiers.some((specifier) => specifier.importKind !== 'type'))
    );
  }
  if (statement.type === 'ExportAllDeclaration') {
    return statement.exportKind !== 'type';
  }
  if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
    if (statement.declaration) {
      return runtimeStatement(statement.declaration);
    }
    return (
      statement.exportKind !== 'type' &&
      statement.specifiers.some((specifier) => specifier.exportKind !== 'type')
    );
  }
  return !topLevelTypeDeclaration(statement);
}

const noTypesInRuntimeFiles = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      mixed: 'Move top-level type declarations into a dedicated type-only file.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    return {
      Program(node) {
        if (!isTypeOnlyFile(filename) && node.body.some(runtimeStatement)) {
          for (const statement of node.body.filter(topLevelTypeDeclaration)) {
            context.report({ node: declarationNode(statement), messageId: 'mixed' });
          }
        }
      },
    };
  },
};

export default noTypesInRuntimeFiles;
