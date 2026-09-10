import type { ESTree } from '@oxlint/plugins';
import * as v from 'valibot';

const VALIBOT_SOURCES = new Set(['valibot', 'valibot/']);
const CONFIG_BINDINGS_PROP = Symbol.for('agent-quality-gate.valibot.configBindings');

const ValibotBindingsSchema = v.object({
  namespaces: v.instance(Set),
  named: v.instance(Map),
});

function isValibotSource(source: string): boolean {
  return VALIBOT_SOURCES.has(source) || source.startsWith('valibot/');
}

function collectFromImportDeclaration(
  statement: ESTree.ImportDeclaration,
  namespaces: Set<string>,
  named: Map<string, string>,
): void {
  if (typeof statement.source.value !== 'string' || !isValibotSource(statement.source.value)) {
    return;
  }
  for (const specifier of statement.specifiers) {
    if (
      specifier.type === 'ImportNamespaceSpecifier' ||
      specifier.type === 'ImportDefaultSpecifier'
    ) {
      namespaces.add(specifier.local.name);
      continue;
    }
    const imported = specifier.imported;
    if (!('name' in imported)) {
      continue;
    }
    named.set(specifier.local.name, imported.name);
  }
}

function buildValibotBindings(program: ESTree.Program): ValibotBindings {
  const namespaces = new Set<string>();
  const named = new Map<string, string>();

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      collectFromImportDeclaration(statement, namespaces, named);
    }
  }

  return { namespaces, named };
}

function isValibotBindings(value: unknown): value is ValibotBindings {
  return v.is(ValibotBindingsSchema, value);
}

export function collectValibotBindings(program: ESTree.Program): ValibotBindings {
  const cached: unknown = Reflect.get(program, CONFIG_BINDINGS_PROP);
  if (isValibotBindings(cached)) {
    return cached;
  }
  const built = buildValibotBindings(program);
  Reflect.set(program, CONFIG_BINDINGS_PROP, built);
  return built;
}

export function calleeExportName(callee: ESTree.Node, bindings: ValibotBindings): string | null {
  if (callee.type === 'Identifier') {
    return bindings.named.get(callee.name) ?? null;
  }
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return null;
  }
  if (callee.object.type !== 'Identifier' || !bindings.namespaces.has(callee.object.name)) {
    return null;
  }
  if (callee.property.type !== 'Identifier') {
    return null;
  }
  return callee.property.name;
}

export function isValibotCustomImport(specifier: ESTree.ImportSpecifier, source: string): boolean {
  if (!isValibotSource(source)) {
    return false;
  }
  const imported = specifier.imported;
  return 'name' in imported && imported.name === 'custom';
}

export type ValibotBindings = {
  namespaces: ReadonlySet<string>;
  named: ReadonlyMap<string, string>;
};
