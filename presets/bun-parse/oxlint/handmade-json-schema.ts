import type { ESTree } from '@oxlint/plugins';

import { unwrapExpression } from '../../../scripts/oxlint-walk/oxlint-walk.ts';
import {
  collectSchemaValibotBindings,
  schemaCalleeExportName,
  type SchemaValibotBindings,
} from './valibot-bindings.ts';
import { classifyHandmadeUnion, type UnionMemberKind } from './handmade-json-union-shape.ts';
import type { UnionShape } from './no-handmade-json-types.ts';
import { sourceImportsValibot } from './source-fast-path.ts';

const JSON_PRIMITIVE_SCHEMAS = new Set(['string', 'number', 'boolean', 'null']);
const LOOSE_CONTAINER_SCHEMAS = new Set(['unknown', 'any']);

export type SchemaConstEntry = {
  id: ESTree.BindingIdentifier;
  init: ESTree.Expression;
};

function topLevelConstDeclarators(statement: ESTree.Node): readonly ESTree.VariableDeclarator[] {
  const declaration =
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
  if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
    return [];
  }
  return declaration.declarations;
}

export function collectSchemaConsts(program: ESTree.Program): Map<string, SchemaConstEntry> {
  const schemas = new Map<string, SchemaConstEntry>();
  for (const statement of program.body) {
    for (const declarator of topLevelConstDeclarators(statement)) {
      if (declarator.id.type !== 'Identifier' || declarator.init == null) {
        continue;
      }
      schemas.set(declarator.id.name, { id: declarator.id, init: declarator.init });
    }
  }
  return schemas;
}

export function valibotCallName(node: ESTree.Node, bindings: SchemaValibotBindings): string | null {
  const unwrapped = unwrapExpression(node);
  if (unwrapped.type !== 'CallExpression') {
    return null;
  }
  return schemaCalleeExportName(unwrapped.callee, bindings);
}

function schemaExpression(node: ESTree.Node | undefined): ESTree.Node | null {
  if (node === undefined || node.type === 'SpreadElement') {
    return null;
  }
  const unwrapped = unwrapExpression(node);
  if (
    unwrapped.type === 'Identifier' ||
    unwrapped.type === 'CallExpression' ||
    unwrapped.type === 'Literal' ||
    unwrapped.type === 'ArrowFunctionExpression'
  ) {
    return unwrapped;
  }
  return null;
}

function unwrapSchemaExpression(node: ESTree.Node, bindings: SchemaValibotBindings): ESTree.Node {
  let current = unwrapExpression(node);
  while (current.type === 'CallExpression') {
    const name = valibotCallName(current, bindings);
    if (name === 'pipe' && current.arguments.length > 0) {
      const argument = schemaExpression(current.arguments[0]);
      if (argument == null) {
        break;
      }
      current = argument;
      continue;
    }
    break;
  }
  return current;
}

function isJsonPrimitiveSchema(node: ESTree.Node, bindings: SchemaValibotBindings): boolean {
  const unwrapped = unwrapSchemaExpression(node, bindings);
  if (unwrapped.type !== 'CallExpression') {
    return false;
  }
  const name = valibotCallName(unwrapped, bindings);
  return name != null && JSON_PRIMITIVE_SCHEMAS.has(name);
}

function isLooseContainerValue(
  node: ESTree.Node,
  selfName: string,
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): boolean {
  const unwrapped = unwrapSchemaExpression(node, bindings);
  if (unwrapped.type === 'CallExpression') {
    const name = valibotCallName(unwrapped, bindings);
    return name != null && LOOSE_CONTAINER_SCHEMAS.has(name);
  }
  if (unwrapped.type === 'Identifier') {
    if (unwrapped.name === selfName) {
      return true;
    }
    const partner = schemas.get(unwrapped.name);
    return (
      partner != null && schemaContainerKind(partner.init, selfName, schemas, bindings) != null
    );
  }
  return false;
}

function arrayElement(
  call: ESTree.CallExpression,
  bindings: SchemaValibotBindings,
): ESTree.Node | null {
  if (valibotCallName(call, bindings) !== 'array' || call.arguments.length === 0) {
    return null;
  }
  return schemaExpression(call.arguments[0]);
}

function isStringSchemaCall(node: ESTree.Node | null, bindings: SchemaValibotBindings): boolean {
  return node?.type === 'CallExpression' && valibotCallName(node, bindings) === 'string';
}

function recordValue(
  call: ESTree.CallExpression,
  bindings: SchemaValibotBindings,
): ESTree.Node | null {
  if (valibotCallName(call, bindings) !== 'record' || call.arguments.length < 2) {
    return null;
  }
  const key = schemaExpression(call.arguments[0]);
  if (!isStringSchemaCall(key, bindings)) {
    return null;
  }
  return schemaExpression(call.arguments[1]);
}

function unionMembers(node: ESTree.Node, bindings: SchemaValibotBindings): readonly ESTree.Node[] {
  const unwrapped = unwrapSchemaExpression(node, bindings);
  if (unwrapped.type !== 'CallExpression' || valibotCallName(unwrapped, bindings) !== 'union') {
    return [];
  }
  const members = unwrapped.arguments[0];
  if (members.type !== 'ArrayExpression') {
    return [];
  }
  return members.elements.flatMap((element) => {
    if (!element || element.type === 'SpreadElement') {
      return [];
    }
    return [element];
  });
}

function containerKindFromCall(
  call: ESTree.CallExpression,
  selfName: string,
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): 'array' | 'index' | null {
  const arrayElementValue = arrayElement(call, bindings);
  if (
    arrayElementValue != null &&
    isLooseContainerValue(arrayElementValue, selfName, schemas, bindings)
  ) {
    return 'array';
  }
  const recordElementValue = recordValue(call, bindings);
  if (
    recordElementValue != null &&
    isLooseContainerValue(recordElementValue, selfName, schemas, bindings)
  ) {
    return 'index';
  }
  return null;
}

function schemaContainerKind(
  init: ESTree.Node,
  selfName: string,
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): 'array' | 'index' | null {
  const unwrapped = unwrapSchemaExpression(init, bindings);
  if (unwrapped.type !== 'CallExpression') {
    return null;
  }
  return containerKindFromCall(unwrapped, selfName, schemas, bindings);
}

function valibotUnionMemberKind(
  member: ESTree.Node,
  selfName: string,
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): UnionMemberKind | null {
  if (isJsonPrimitiveSchema(member, bindings)) {
    return { type: 'primitive' };
  }
  const unwrapped = unwrapSchemaExpression(member, bindings);
  if (unwrapped.type === 'CallExpression') {
    const kind = containerKindFromCall(unwrapped, selfName, schemas, bindings);
    if (kind === 'array') {
      return { type: 'array' };
    }
    if (kind === 'index') {
      return { type: 'index' };
    }
  }
  if (unwrapped.type !== 'Identifier' || unwrapped.name === selfName) {
    return null;
  }
  const partnerEntry = schemas.get(unwrapped.name);
  if (partnerEntry == null) {
    return null;
  }
  const kind = schemaContainerKind(partnerEntry.init, selfName, schemas, bindings);
  if (kind === 'array') {
    return { type: 'partner', name: unwrapped.name, container: 'array' };
  }
  if (kind === 'index') {
    return { type: 'partner', name: unwrapped.name, container: 'index' };
  }
  return null;
}

function* valibotUnionMemberKinds(
  selfName: string,
  members: readonly ESTree.Node[],
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): Generator<UnionMemberKind> {
  for (const member of members) {
    const kind = valibotUnionMemberKind(member, selfName, schemas, bindings);
    if (kind != null) {
      yield kind;
    }
  }
}

function classifyValibotUnion(
  selfName: string,
  members: readonly ESTree.Node[],
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): UnionShape {
  return classifyHandmadeUnion(valibotUnionMemberKinds(selfName, members, schemas, bindings));
}

function isLooseRecordSchemaConst(
  init: ESTree.Expression,
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): boolean {
  const unwrapped = unwrapSchemaExpression(init, bindings);
  if (unwrapped.type !== 'CallExpression') {
    return false;
  }
  if (valibotCallName(unwrapped, bindings) !== 'record') {
    return false;
  }
  const value = recordValue(unwrapped, bindings);
  return value != null && isLooseContainerValue(value, '', schemas, bindings);
}

function schemaScanContext(
  program: ESTree.Program,
  sourceText?: string,
): {
  bindings: SchemaValibotBindings;
  schemas: Map<string, SchemaConstEntry>;
} | null {
  if (sourceText != null && !sourceImportsValibot(sourceText)) {
    return null;
  }
  const bindings = collectSchemaValibotBindings(program);
  if (bindings.namespaces.size === 0 && bindings.named.size === 0) {
    return null;
  }
  return { bindings, schemas: collectSchemaConsts(program) };
}

export function collectLooseRecordSchemaNames(
  program: ESTree.Program,
  sourceText?: string,
): Set<string> {
  const context = schemaScanContext(program, sourceText);
  if (context == null) {
    return new Set();
  }
  const { bindings, schemas } = context;
  const names = new Set<string>();
  for (const [name, entry] of schemas) {
    if (isLooseRecordSchemaConst(entry.init, schemas, bindings)) {
      names.add(name);
    }
  }
  return names;
}

function isHandmadeJsonSchemaConst(
  name: string,
  init: ESTree.Expression,
  schemas: ReadonlyMap<string, SchemaConstEntry>,
  bindings: SchemaValibotBindings,
): boolean {
  const members = unionMembers(init, bindings);
  if (members.length === 0) {
    return false;
  }
  return classifyValibotUnion(name, members, schemas, bindings).handmade;
}

export function findHandmadeJsonSchemaNames(
  program: ESTree.Program,
  sourceText?: string,
): Map<string, ESTree.BindingIdentifier> {
  const context = schemaScanContext(program, sourceText);
  if (context == null) {
    return new Map();
  }
  const { bindings, schemas } = context;
  const reported = new Map<string, ESTree.BindingIdentifier>();
  for (const [name, entry] of schemas) {
    if (isHandmadeJsonSchemaConst(name, entry.init, schemas, bindings)) {
      reported.set(name, entry.id);
      const members = unionMembers(entry.init, bindings);
      const shape = classifyValibotUnion(name, members, schemas, bindings);
      for (const partner of shape.partners) {
        const partnerEntry = schemas.get(partner);
        if (partnerEntry != null) {
          reported.set(partner, partnerEntry.id);
        }
      }
      continue;
    }
    if (isLooseRecordSchemaConst(entry.init, schemas, bindings)) {
      reported.set(name, entry.id);
    }
  }
  return reported;
}
