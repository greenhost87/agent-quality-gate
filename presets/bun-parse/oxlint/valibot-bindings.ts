import type { ESTree } from '@oxlint/plugins';
import * as v from 'valibot';

import { forEachValibotImportSpecifier } from './valibot-imports.ts';
import { importedName } from './import-specifier-name.ts';
import { memberName } from './member-name.ts';

const PARSE_BINDINGS_PROP = Symbol.for('agent-quality-gate.valibot.parseBindings');
const SCHEMA_BINDINGS_PROP = Symbol.for('agent-quality-gate.valibot.schemaBindings');

const ParseValibotBindingsSchema = v.object({
  named: v.instance(Set),
  namespaces: v.instance(Set),
});

const SchemaValibotBindingsSchema = v.object({
  namespaces: v.instance(Set),
  named: v.instance(Map),
});

function noteNamespaceImport(specifier: ESTree.Node, namespaces: Set<string>): void {
  if (specifier.type === 'ImportNamespaceSpecifier') {
    namespaces.add(specifier.local.name);
  }
}

export function noteParseValibotImportSpecifier(
  specifier: ESTree.Node,
  bindings: ParseValibotBindings,
): void {
  noteNamespaceImport(specifier, bindings.namespaces);
  if (
    specifier.type === 'ImportSpecifier' &&
    (importedName(specifier) === 'parse' || importedName(specifier) === 'safeParse')
  ) {
    bindings.named.add(specifier.local.name);
  }
}

function buildParseValibotBindings(root: ESTree.Node): ParseValibotBindings {
  const bindings: ParseValibotBindings = { named: new Set(), namespaces: new Set() };
  forEachValibotImportSpecifier(root, (specifier) => {
    noteParseValibotImportSpecifier(specifier, bindings);
  });
  return bindings;
}

function buildSchemaValibotBindings(program: ESTree.Program): SchemaValibotBindings {
  const bindings: SchemaValibotBindings = { namespaces: new Set(), named: new Map() };
  forEachValibotImportSpecifier(program, (specifier) => {
    noteNamespaceImport(specifier, bindings.namespaces);
    if (specifier.type === 'ImportSpecifier') {
      const imported = importedName(specifier);
      if (imported != null) {
        bindings.named.set(specifier.local.name, imported);
      }
    }
  });
  return bindings;
}

function isParseValibotBindings(value: unknown): value is ParseValibotBindings {
  return v.is(ParseValibotBindingsSchema, value);
}

function isSchemaValibotBindings(value: unknown): value is SchemaValibotBindings {
  return v.is(SchemaValibotBindingsSchema, value);
}

export function collectParseValibotBindings(root: ESTree.Node): ParseValibotBindings {
  if (root.type !== 'Program') {
    return buildParseValibotBindings(root);
  }
  const cached: unknown = Reflect.get(root, PARSE_BINDINGS_PROP);
  if (isParseValibotBindings(cached)) {
    return cached;
  }
  const built = buildParseValibotBindings(root);
  Reflect.set(root, PARSE_BINDINGS_PROP, built);
  return built;
}

export function collectSchemaValibotBindings(program: ESTree.Program): SchemaValibotBindings {
  const cached: unknown = Reflect.get(program, SCHEMA_BINDINGS_PROP);
  if (isSchemaValibotBindings(cached)) {
    return cached;
  }
  const built = buildSchemaValibotBindings(program);
  Reflect.set(program, SCHEMA_BINDINGS_PROP, built);
  return built;
}

export function schemaCalleeExportName(
  callee: ESTree.Node,
  bindings: SchemaValibotBindings,
): string | null {
  if (callee.type === 'Identifier') {
    return bindings.named.get(callee.name) ?? null;
  }
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return null;
  }
  if (callee.object.type !== 'Identifier' || !bindings.namespaces.has(callee.object.name)) {
    return null;
  }
  return memberName(callee);
}

export type ParseValibotBindings = {
  named: Set<string>;
  namespaces: Set<string>;
};

export type SchemaValibotBindings = {
  namespaces: Set<string>;
  named: Map<string, string>;
};
