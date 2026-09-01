import type { ESTree } from '@oxlint/plugins';

import { collectLooseRecordSchemaNames } from './handmade-json-schema.ts';
import { handmadeExportedReturnType } from './handmade-json-shape.ts';
import type { TypeTables } from './no-handmade-json-types.ts';
import {
  effectiveReturnType,
  isLooseObjectType,
  isLooseStringIndexType,
  typeUnions,
  unwrapType,
} from './handmade-ts-type-helpers.ts';

function exportReturnAnnotation(annotation: ESTree.TSType): ESTree.TSType {
  let current = effectiveReturnType(annotation);
  const unwrapped = unwrapType(current);
  if (
    unwrapped.type === 'TSTypeReference' &&
    unwrapped.typeName.type === 'Identifier' &&
    unwrapped.typeName.name === 'Promise' &&
    unwrapped.typeArguments?.params.length === 1
  ) {
    current = unwrapType(unwrapped.typeArguments.params[0]);
  }
  return current;
}

function inferOutputSchemaName(member: ESTree.TSType): string | null {
  const unwrapped = unwrapType(member);
  if (unwrapped.type !== 'TSTypeReference') {
    return null;
  }
  const typeName = unwrapped.typeName;
  const isInferOutput =
    (typeName.type === 'Identifier' && typeName.name === 'InferOutput') ||
    (typeName.type === 'TSQualifiedName' && typeName.right.name === 'InferOutput');
  if (!isInferOutput) {
    return null;
  }
  const params = unwrapped.typeArguments?.params;
  if (params?.length !== 1) {
    return null;
  }
  const typeofArg = unwrapType(params[0]);
  if (typeofArg.type !== 'TSTypeQuery' || typeofArg.exprName.type !== 'Identifier') {
    return null;
  }
  return typeofArg.exprName.name;
}

function referencesLooseRecordSchema(
  member: ESTree.TSType,
  looseSchemaNames: ReadonlySet<string>,
): boolean {
  const schemaName = inferOutputSchemaName(member);
  return schemaName != null && looseSchemaNames.has(schemaName);
}

function isHandmadeLooseObjectReturn(
  annotation: ESTree.TSType,
  tables: TypeTables,
  looseSchemaNames: ReadonlySet<string>,
): boolean {
  const effective = exportReturnAnnotation(annotation);
  const members = typeUnions(effective);
  for (const member of members) {
    if (isLooseObjectType(member) || isLooseStringIndexType(member)) {
      return true;
    }
    if (referencesLooseRecordSchema(member, looseSchemaNames)) {
      return true;
    }
  }
  return handmadeExportedReturnType(effective, tables);
}

function skipExportedReturnScan(annotation: ESTree.TSType | undefined): boolean {
  if (annotation == null) {
    return true;
  }
  if (annotation.type !== 'TSTypePredicate') {
    return false;
  }
  const effective = exportReturnAnnotation(annotation);
  if (isLooseObjectType(effective) || isLooseStringIndexType(effective)) {
    return false;
  }
  return effective.type === 'TSTypeReference' && effective.typeName.type === 'Identifier';
}

function reportHandmadeReturn(
  id: ESTree.BindingIdentifier,
  annotation: ESTree.TSType | undefined,
  tables: TypeTables,
  looseSchemaNames: ReadonlySet<string>,
  reported: Map<string, ESTree.BindingIdentifier>,
): void {
  if (skipExportedReturnScan(annotation) || annotation == null) {
    return;
  }
  if (isHandmadeLooseObjectReturn(annotation, tables, looseSchemaNames)) {
    reported.set(id.name, id);
  }
}

function collectVariableExportReturns(
  declaration: ESTree.VariableDeclaration,
  tables: TypeTables,
  looseSchemaNames: ReadonlySet<string>,
  reported: Map<string, ESTree.BindingIdentifier>,
): void {
  for (const declarator of declaration.declarations) {
    if (declarator.id.type !== 'Identifier' || declarator.init == null) {
      continue;
    }
    const init = declarator.init;
    if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') {
      continue;
    }
    reportHandmadeReturn(
      declarator.id,
      init.returnType?.typeAnnotation,
      tables,
      looseSchemaNames,
      reported,
    );
  }
}

function collectExportedReturnReports(
  program: ESTree.Program,
  tables: TypeTables,
  looseSchemaNames: ReadonlySet<string>,
  reported: Map<string, ESTree.BindingIdentifier>,
): void {
  for (const statement of program.body) {
    if (statement.type !== 'ExportNamedDeclaration') {
      continue;
    }
    const declaration = statement.declaration;
    if (declaration?.type === 'FunctionDeclaration' && declaration.id != null) {
      reportHandmadeReturn(
        declaration.id,
        declaration.returnType?.typeAnnotation,
        tables,
        looseSchemaNames,
        reported,
      );
      continue;
    }
    if (declaration?.type === 'VariableDeclaration') {
      collectVariableExportReturns(declaration, tables, looseSchemaNames, reported);
    }
  }
}

export function findHandmadeJsonExportedReturns(
  program: ESTree.Program,
  tables: TypeTables,
  sourceText?: string,
): Map<string, ESTree.BindingIdentifier> {
  const reported = new Map<string, ESTree.BindingIdentifier>();
  const looseSchemaNames = collectLooseRecordSchemaNames(program, sourceText);
  collectExportedReturnReports(program, tables, looseSchemaNames, reported);
  return reported;
}
