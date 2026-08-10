import { declarationNode, isReadonlyStringLiteralCatalog } from '../ast.mjs';
import { isTypeOnlyFile } from '../type-only-files.mjs';

function topLevelTypeDeclaration(statement) {
  const declaration = declarationNode(statement);
  return declaration?.type === 'TSInterfaceDeclaration' || declaration?.type === 'TSTypeAliasDeclaration';
}

function exportedCatalogNames(program) {
  const names = new Set();
  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : null;
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
      continue;
    }
    for (const item of declaration.declarations) {
      if (item.id.type === 'Identifier' && isReadonlyStringLiteralCatalog(item.init)) {
        names.add(item.id.name);
      }
    }
  }
  return names;
}

function isCompanionType(statement, catalogNames) {
  if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'TSTypeAliasDeclaration') {
    return false;
  }
  const type = statement.declaration.typeAnnotation;
  return (
    statement.declaration.typeParameters == null &&
    type.type === 'TSIndexedAccessType' &&
    type.objectType.type === 'TSTypeQuery' &&
    type.objectType.exprName.type === 'Identifier' &&
    type.objectType.typeArguments == null &&
    catalogNames.has(type.objectType.exprName.name) &&
    type.indexType.type === 'TSNumberKeyword'
  );
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
          const catalogNames = exportedCatalogNames(node);
          for (const statement of node.body.filter(topLevelTypeDeclaration)) {
            if (!isCompanionType(statement, catalogNames)) {
              context.report({ node: declarationNode(statement), messageId: 'mixed' });
            }
          }
        }
      },
    };
  },
};

export default noTypesInRuntimeFiles;
