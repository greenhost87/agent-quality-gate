import type { ESTree } from '@oxlint/plugins';

const VALIBOT_SOURCES = new Set(['valibot', 'valibot/']);

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

export function collectValibotBindings(program: ESTree.Program): ValibotBindings {
  const namespaces = new Set<string>();
  const named = new Map<string, string>();

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      collectFromImportDeclaration(statement, namespaces, named);
    }
  }

  return { namespaces, named };
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
