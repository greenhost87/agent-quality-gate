import type { ESTree } from '@oxlint/plugins';

export function unwrapType(node: ESTree.TSType): ESTree.TSType {
  if (node.type === 'TSParenthesizedType') {
    return unwrapType(node.typeAnnotation);
  }
  return node;
}

export function flattenUnion(node: ESTree.TSType): ESTree.TSType[] {
  const unwrapped = unwrapType(node);
  if (unwrapped.type === 'TSUnionType') {
    return unwrapped.types.flatMap((member) => flattenUnion(member));
  }
  return [unwrapped];
}

export function typeUnions(node: ESTree.TSType): ESTree.TSType[] {
  return flattenUnion(node);
}

export function indexSignatureValue(member: ESTree.TSIndexSignature): ESTree.TSType | null {
  if (member.parameters.length !== 1) {
    return null;
  }
  const parameter = member.parameters[0];
  if (unwrapType(parameter.typeAnnotation.typeAnnotation).type !== 'TSStringKeyword') {
    return null;
  }
  return member.typeAnnotation.typeAnnotation;
}

export function stringIndexValueType(node: ESTree.TSType): ESTree.TSType | null {
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

export function isLooseObjectType(node: ESTree.TSType): boolean {
  return unwrapType(node).type === 'TSObjectKeyword';
}

const JSON_PRIMITIVE_TYPES = new Set([
  'TSStringKeyword',
  'TSNumberKeyword',
  'TSBooleanKeyword',
  'TSNullKeyword',
]);

const LOOSE_UNKNOWN_TYPES = new Set(['TSUnknownKeyword', 'TSAnyKeyword']);

function matchesUnwrappedType(node: ESTree.TSType, allowed: ReadonlySet<string>): boolean {
  return allowed.has(unwrapType(node).type);
}

export function isJsonPrimitiveType(node: ESTree.TSType): boolean {
  return matchesUnwrappedType(node, JSON_PRIMITIVE_TYPES);
}

export function isLooseStringIndexType(node: ESTree.TSType): boolean {
  const value = stringIndexValueType(node);
  if (value == null) {
    return false;
  }
  return matchesUnwrappedType(value, LOOSE_UNKNOWN_TYPES);
}

export function effectiveReturnType(annotation: ESTree.TSType): ESTree.TSType {
  if (annotation.type !== 'TSTypePredicate') {
    return annotation;
  }
  const wrapped = annotation.typeAnnotation;
  if (wrapped == null) {
    return annotation;
  }
  return wrapped.typeAnnotation;
}
