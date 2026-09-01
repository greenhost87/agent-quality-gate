import type { ESTree } from '@oxlint/plugins';

import type { InterfaceEntry, TypeAliasEntry, TypeTables } from './no-handmade-json-types.ts';
import { classifyHandmadeUnion, type UnionMemberKind } from './handmade-json-union-shape.ts';
import {
  flattenUnion,
  indexSignatureValue,
  isJsonPrimitiveType,
  isLooseObjectType,
  stringIndexValueType,
  unwrapType,
} from './handmade-ts-type-helpers.ts';

export function typeReferenceName(node: ESTree.TSType): string | null {
  const unwrapped = unwrapType(node);
  if (unwrapped.type !== 'TSTypeReference' || unwrapped.typeArguments != null) {
    return null;
  }
  const typeName = unwrapped.typeName;
  if (typeName.type === 'Identifier') {
    return typeName.name;
  }
  return typeName.type === 'TSQualifiedName' ? typeName.right.name : null;
}

function arrayElementType(node: ESTree.TSType): ESTree.TSType | null {
  const unwrapped = unwrapType(node);
  if (unwrapped.type === 'TSArrayType') {
    return unwrapped.elementType;
  }
  if (
    unwrapped.type !== 'TSTypeReference' ||
    unwrapped.typeName.type !== 'Identifier' ||
    unwrapped.typeName.name !== 'Array' ||
    unwrapped.typeArguments?.params.length !== 1
  ) {
    return null;
  }
  return unwrapped.typeArguments.params[0];
}

function interfaceStringIndexValue(entry: InterfaceEntry): ESTree.TSType | null {
  if (entry.body.body.length !== 1) {
    return null;
  }
  const member = entry.body.body[0];
  return member.type === 'TSIndexSignature' ? indexSignatureValue(member) : null;
}

function topLevelDeclaration(statement: ESTree.Node): ESTree.Node | null {
  if (statement.type === 'ExportNamedDeclaration') {
    return statement.declaration;
  }
  return statement;
}

export function collectTypeTables(program: ESTree.Program): TypeTables {
  const aliases = new Map<string, TypeAliasEntry>();
  const interfaces = new Map<string, InterfaceEntry>();
  for (const statement of program.body) {
    const declaration = topLevelDeclaration(statement);
    if (declaration?.type === 'TSTypeAliasDeclaration' && declaration.typeParameters == null) {
      aliases.set(declaration.id.name, {
        id: declaration.id,
        annotation: declaration.typeAnnotation,
      });
      continue;
    }
    if (
      declaration?.type === 'TSInterfaceDeclaration' &&
      declaration.typeParameters == null &&
      declaration.extends.length === 0
    ) {
      interfaces.set(declaration.id.name, { id: declaration.id, body: declaration.body });
    }
  }
  return { aliases, interfaces };
}

function containerValueTowardSelf(
  node: ESTree.TSType,
  selfName: string,
  tables: TypeTables,
  seen: Set<string>,
): 'array' | 'index' | null {
  const element = arrayElementType(node);
  if (element != null && resolvesToSelf(element, selfName, tables, seen)) {
    return 'array';
  }
  const indexValue = stringIndexValueType(node);
  if (indexValue != null && resolvesToSelf(indexValue, selfName, tables, seen)) {
    return 'index';
  }
  return null;
}

function namedContainerTowardSelf(
  name: string,
  selfName: string,
  tables: TypeTables,
  seen: Set<string>,
): 'array' | 'index' | null {
  const alias = tables.aliases.get(name);
  if (alias != null) {
    return containerValueTowardSelf(alias.annotation, selfName, tables, seen);
  }
  const iface = tables.interfaces.get(name);
  if (iface == null) {
    return null;
  }
  const indexValue = interfaceStringIndexValue(iface);
  if (indexValue != null && resolvesToSelf(indexValue, selfName, tables, seen)) {
    return 'index';
  }
  return null;
}

function resolvesToSelf(
  node: ESTree.TSType,
  selfName: string,
  tables: TypeTables,
  seen: Set<string>,
): boolean {
  const name = typeReferenceName(node);
  if (name === selfName) {
    return true;
  }
  if (name == null || seen.has(name)) {
    return false;
  }
  seen.add(name);
  return namedContainerTowardSelf(name, selfName, tables, seen) != null;
}

function* unionMemberKinds(
  selfName: string,
  annotation: ESTree.TSType,
  tables: TypeTables,
): Generator<UnionMemberKind> {
  for (const member of flattenUnion(annotation)) {
    if (isJsonPrimitiveType(member)) {
      yield { type: 'primitive' };
      continue;
    }
    const direct = containerValueTowardSelf(member, selfName, tables, new Set());
    if (direct === 'array') {
      yield { type: 'array' };
      continue;
    }
    if (direct === 'index') {
      yield { type: 'index' };
      continue;
    }
    const name = typeReferenceName(member);
    if (name == null || name === selfName) {
      continue;
    }
    const kind = namedContainerTowardSelf(name, selfName, tables, new Set());
    if (kind === 'array') {
      yield { type: 'partner', name, container: 'array' };
    } else if (kind === 'index') {
      yield { type: 'partner', name, container: 'index' };
    }
  }
}

function classifyUnion(selfName: string, annotation: ESTree.TSType, tables: TypeTables) {
  return classifyHandmadeUnion(unionMemberKinds(selfName, annotation, tables));
}

type ExportedReturnFlags = {
  primitiveCount: number;
  hasArray: boolean;
  hasIndex: boolean;
  hasLooseObject: boolean;
  referencesHandmadeAlias: boolean;
};

function exportedReturnMemberFlags(member: ESTree.TSType, tables: TypeTables): ExportedReturnFlags {
  if (isJsonPrimitiveType(member)) {
    return {
      primitiveCount: 1,
      hasArray: false,
      hasIndex: false,
      hasLooseObject: false,
      referencesHandmadeAlias: false,
    };
  }
  if (isLooseObjectType(member)) {
    return {
      primitiveCount: 0,
      hasArray: false,
      hasIndex: false,
      hasLooseObject: true,
      referencesHandmadeAlias: false,
    };
  }
  if (arrayElementType(member) != null) {
    return {
      primitiveCount: 0,
      hasArray: true,
      hasIndex: false,
      hasLooseObject: false,
      referencesHandmadeAlias: false,
    };
  }
  if (stringIndexValueType(member) != null) {
    return {
      primitiveCount: 0,
      hasArray: false,
      hasIndex: true,
      hasLooseObject: false,
      referencesHandmadeAlias: false,
    };
  }
  const name = typeReferenceName(member);
  const alias = name == null ? undefined : tables.aliases.get(name);
  return {
    primitiveCount: 0,
    hasArray: false,
    hasIndex: false,
    hasLooseObject: false,
    referencesHandmadeAlias:
      name != null && alias != null && classifyUnion(name, alias.annotation, tables).handmade,
  };
}

export function handmadeExportedReturnType(annotation: ESTree.TSType, tables: TypeTables): boolean {
  let primitiveCount = 0;
  let hasArray = false;
  let hasIndex = false;
  let hasLooseObject = false;
  for (const member of flattenUnion(annotation)) {
    const flags = exportedReturnMemberFlags(member, tables);
    if (flags.referencesHandmadeAlias) {
      return true;
    }
    primitiveCount += flags.primitiveCount;
    hasArray ||= flags.hasArray;
    hasIndex ||= flags.hasIndex;
    hasLooseObject ||= flags.hasLooseObject;
  }
  return (primitiveCount >= 2 && hasArray && hasIndex) || (primitiveCount >= 2 && hasLooseObject);
}

export function findHandmadeJsonTypeNames(
  tables: TypeTables,
): Map<string, ESTree.BindingIdentifier> {
  const reported = new Map<string, ESTree.BindingIdentifier>();
  for (const [name, entry] of tables.aliases) {
    const shape = classifyUnion(name, entry.annotation, tables);
    if (!shape.handmade) {
      continue;
    }
    reported.set(name, entry.id);
    for (const partner of shape.partners) {
      const aliasPartner = tables.aliases.get(partner);
      if (aliasPartner != null) {
        reported.set(partner, aliasPartner.id);
        continue;
      }
      const ifacePartner = tables.interfaces.get(partner);
      if (ifacePartner != null) {
        reported.set(partner, ifacePartner.id);
      }
    }
  }
  return reported;
}
