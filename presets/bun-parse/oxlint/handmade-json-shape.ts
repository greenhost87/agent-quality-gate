import type { ESTree } from '@oxlint/plugins';

import type {
  InterfaceEntry,
  TypeAliasEntry,
  TypeTables,
  UnionShape,
} from './no-handmade-json-types.ts';

function unwrapType(node: ESTree.TSType): ESTree.TSType {
  if (node.type === 'TSParenthesizedType') {
    return unwrapType(node.typeAnnotation);
  }
  return node;
}

export function typeReferenceName(node: ESTree.TSType): string | null {
  const unwrapped = unwrapType(node);
  if (unwrapped.type !== 'TSTypeReference' || unwrapped.typeName.type !== 'Identifier') {
    return null;
  }
  if (unwrapped.typeArguments != null) {
    return null;
  }
  return unwrapped.typeName.name;
}

function isJsonPrimitive(node: ESTree.TSType): boolean {
  const unwrapped = unwrapType(node);
  return (
    unwrapped.type === 'TSStringKeyword' ||
    unwrapped.type === 'TSNumberKeyword' ||
    unwrapped.type === 'TSBooleanKeyword' ||
    unwrapped.type === 'TSNullKeyword'
  );
}

function flattenUnion(node: ESTree.TSType): ESTree.TSType[] {
  const unwrapped = unwrapType(node);
  if (unwrapped.type === 'TSUnionType') {
    return unwrapped.types.flatMap((member) => flattenUnion(member));
  }
  return [unwrapped];
}

function indexSignatureValue(member: ESTree.TSIndexSignature): ESTree.TSType | null {
  if (member.parameters.length !== 1) {
    return null;
  }
  const parameter = member.parameters[0];
  if (unwrapType(parameter.typeAnnotation.typeAnnotation).type !== 'TSStringKeyword') {
    return null;
  }
  return member.typeAnnotation.typeAnnotation;
}

function stringIndexValueType(node: ESTree.TSType): ESTree.TSType | null {
  const unwrapped = unwrapType(node);
  if (unwrapped.type === 'TSTypeLiteral') {
    if (unwrapped.members.length !== 1) {
      return null;
    }
    const member = unwrapped.members[0];
    return member.type === 'TSIndexSignature' ? indexSignatureValue(member) : null;
  }
  if (
    unwrapped.type !== 'TSTypeReference' ||
    unwrapped.typeName.type !== 'Identifier' ||
    unwrapped.typeName.name !== 'Record' ||
    unwrapped.typeArguments?.params.length !== 2
  ) {
    return null;
  }
  const [key, value] = unwrapped.typeArguments.params;
  if (unwrapType(key).type !== 'TSStringKeyword') {
    return null;
  }
  return value;
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

function classifyUnion(
  selfName: string,
  annotation: ESTree.TSType,
  tables: TypeTables,
): UnionShape {
  let primitiveCount = 0;
  let hasArray = false;
  let hasIndex = false;
  const partners = new Set<string>();
  for (const member of flattenUnion(annotation)) {
    if (isJsonPrimitive(member)) {
      primitiveCount += 1;
      continue;
    }
    const direct = containerValueTowardSelf(member, selfName, tables, new Set());
    if (direct === 'array') {
      hasArray = true;
      continue;
    }
    if (direct === 'index') {
      hasIndex = true;
      continue;
    }
    const name = typeReferenceName(member);
    if (name == null || name === selfName) {
      continue;
    }
    const kind = namedContainerTowardSelf(name, selfName, tables, new Set());
    if (kind === 'array') {
      hasArray = true;
      partners.add(name);
    } else if (kind === 'index') {
      hasIndex = true;
      partners.add(name);
    }
  }
  return {
    handmade: primitiveCount >= 2 && hasArray && hasIndex,
    partners,
  };
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
