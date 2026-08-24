import { defineRule, type ESTree } from '@oxlint/plugins';

import {
  addIdentifierDeclaratorNames,
  declarationNode,
  isReadonlyStringLiteralCatalog,
  topLevelConstDeclaration,
} from '../ast.ts';
import { isTypeOnlyFile } from '../type-only-files.ts';

const SCHEMA_INFER_TYPE_NAMES = new Set(['InferOutput', 'InferInput']);

function topLevelTypeDeclaration(statement: ESTree.Node): boolean {
  const declaration = declarationNode(statement);
  return (
    declaration?.type === 'TSInterfaceDeclaration' || declaration?.type === 'TSTypeAliasDeclaration'
  );
}

function collectTopLevelConstNames(
  program: ESTree.Program,
  mode: 'exported' | 'local',
  include: (item: ESTree.VariableDeclarator) => boolean = () => true,
): Set<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    const declaration = topLevelConstDeclaration(statement, mode);
    if (declaration !== null) {
      addIdentifierDeclaratorNames(names, declaration, include);
    }
  }
  return names;
}

function isCatalogCompanionType(statement: ESTree.Node, catalogNames: Set<string>): boolean {
  if (
    statement.type !== 'ExportNamedDeclaration' ||
    statement.declaration?.type !== 'TSTypeAliasDeclaration'
  ) {
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

function schemaInferTypeName(typeName: ESTree.TSTypeName): string | null {
  if (typeName.type === 'Identifier') {
    return typeName.name;
  }
  if (typeName.type === 'TSQualifiedName' && typeName.left.type === 'Identifier') {
    return typeName.right.name;
  }
  return null;
}

function isSchemaInferCompanionType(statement: ESTree.Node, constNames: Set<string>): boolean {
  if (
    statement.type !== 'ExportNamedDeclaration' ||
    statement.declaration?.type !== 'TSTypeAliasDeclaration'
  ) {
    return false;
  }
  const alias = statement.declaration;
  if (alias.typeParameters != null) {
    return false;
  }
  const type = alias.typeAnnotation;
  if (type.type !== 'TSTypeReference' || type.typeArguments?.params.length !== 1) {
    return false;
  }
  const inferName = schemaInferTypeName(type.typeName);
  if (inferName === null || !SCHEMA_INFER_TYPE_NAMES.has(inferName)) {
    return false;
  }
  const argument = type.typeArguments.params[0];
  if (
    argument?.type !== 'TSTypeQuery' ||
    argument.exprName.type !== 'Identifier' ||
    argument.typeArguments != null
  ) {
    return false;
  }
  return constNames.has(argument.exprName.name);
}

function isCompanionType(
  statement: ESTree.Node,
  catalogNames: Set<string>,
  constNames: Set<string>,
): boolean {
  return (
    isCatalogCompanionType(statement, catalogNames) ||
    isSchemaInferCompanionType(statement, constNames)
  );
}

function runtimeStatement(statement: ESTree.Node): boolean {
  if (statement.type === 'ImportDeclaration') {
    return (
      statement.importKind !== 'type' &&
      (statement.specifiers.length === 0 ||
        statement.specifiers.some((specifier) => {
          const importKind = 'importKind' in specifier ? specifier.importKind : undefined;
          return importKind !== 'type';
        }))
    );
  }
  if (statement.type === 'ExportAllDeclaration') {
    return statement.exportKind !== 'type';
  }
  if (
    statement.type === 'ExportNamedDeclaration' ||
    statement.type === 'ExportDefaultDeclaration'
  ) {
    if (statement.declaration) {
      return runtimeStatement(statement.declaration);
    }
    if (statement.type !== 'ExportNamedDeclaration') {
      return false;
    }
    return (
      statement.exportKind !== 'type' &&
      statement.specifiers.some((specifier) => specifier.exportKind !== 'type')
    );
  }
  return !topLevelTypeDeclaration(statement);
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      mixed: 'Move top-level type declarations into a dedicated type-only file.',
    },
  },
  createOnce(context) {
    function checkProgram(node: ESTree.Program): void {
      const filename = context.filename.replaceAll('\\', '/');
      if (isTypeOnlyFile(filename) || !node.body.some(runtimeStatement)) {
        return;
      }
      const catalogNames = collectTopLevelConstNames(node, 'exported', (item) =>
        isReadonlyStringLiteralCatalog(item.init),
      );
      const constNames = collectTopLevelConstNames(node, 'local');
      for (const statement of node.body) {
        if (
          !topLevelTypeDeclaration(statement) ||
          isCompanionType(statement, catalogNames, constNames)
        ) {
          continue;
        }
        const reported = declarationNode(statement);
        if (reported) {
          context.report({ node: reported, messageId: 'mixed' });
        }
      }
    }

    return {
      before() {
        checkProgram(context.sourceCode.ast);
        return false;
      },
      Program() {},
    };
  },
});
