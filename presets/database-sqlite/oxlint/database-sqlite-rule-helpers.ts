import { type Context, type ESTree } from '@oxlint/plugins';
import { posix } from 'node:path';
import * as v from 'valibot';

import type {
  SqliteFileFlags,
  SqliteTestBindings,
  SqliteTestFileFlags,
  SqliteTestState,
} from './sqlite-flags.ts';

const daoImportPattern = /\.dao(?:\.[^/]+)*(?:\.[cm]?[jt]s)?$/u;
const daoPlacementSuffixPattern = /^[^/]+\/[^/]+\.dao(?:\.[^/]+)*\.[cm]?[jt]s$/u;
const DatabaseDirectoryOptionsSchema = v.object({
  databaseDirectory: v.optional(v.string(), 'system/database'),
});
const canonicalTestDatabaseImportPattern = /(?:^|\/)testDatabase(?:\.[cm]?[jt]s)?$/u;
const testDatabaseHelperImportPattern =
  /(?:^|\/)(?:testDatabase|test-database|test_database)(?:\.[cm]?[jt]s)?$/u;
export const testDatabaseSetupPath = 'tests/setup/testDatabase.ts';
export const testFilePattern = /^tests\//u;
export const unitTestFilePattern = /^tests\/unit\//u;
const ddlPattern =
  /^\s*(?:CREATE(?:\s+OR\s+REPLACE)?(?:\s+TEMP(?:ORARY)?)?(?:\s+UNIQUE)?\s+(?:TABLE|INDEX|VIEW|TRIGGER|VIRTUAL\s+TABLE)|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX|VIEW|TRIGGER))\b/iu;
const bunTestApiNames = new Set(['describe', 'it', 'test']);
export const publicTestDatabaseExportName = 'useIsolatedTestDatabase';
const privateConnectionExportNames = new Set([
  'installDatabaseForTests',
  'releaseDatabaseForTests',
]);

export function projectPath(context: Context): string {
  const root = context.cwd.replaceAll('\\', '/');
  const filename = context.filename.replaceAll('\\', '/');
  const relativePath = filename.startsWith(`${root}/`) ? filename.slice(root.length + 1) : filename;
  if (relativePath.startsWith('payload/')) {
    return relativePath.slice('payload/'.length);
  }
  if (relativePath.startsWith('examples/')) {
    return relativePath.slice('examples/'.length);
  }
  return relativePath;
}

export function configuredDatabaseDirectory(context: Context): string {
  return v.parse(DatabaseDirectoryOptionsSchema, context.options[0] ?? {}).databaseDirectory;
}

export function hasValidDaoPlacement(relativePath: string, databaseDirectory: string): boolean {
  const prefix = `${databaseDirectory}/`;
  return (
    relativePath.startsWith(prefix) &&
    daoPlacementSuffixPattern.test(relativePath.slice(prefix.length))
  );
}

function importSource(node: ESTree.ImportDeclaration): string | null {
  return typeof node.source.value === 'string' ? node.source.value : null;
}

function resolvedProjectImport(relativePath: string, source: string): string | null {
  if (source.startsWith('@/')) {
    return posix.normalize(source.slice(2));
  }
  if (!source.startsWith('.')) {
    return null;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(relativePath), source));
  return resolved === '..' || resolved.startsWith('../') ? null : resolved;
}

function importsDatabaseModule(
  relativePath: string,
  source: string,
  databaseDirectory: string,
  moduleName: 'connection' | 'migrate',
): boolean {
  const resolved = resolvedProjectImport(relativePath, source);
  if (resolved === null) {
    return false;
  }
  const modulePath = `${databaseDirectory}/${moduleName}`;
  return (
    resolved === modulePath ||
    ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].some(
      (extension) => resolved === `${modulePath}${extension}`,
    )
  );
}

function isTypeOnlyImport(node: ESTree.ImportDeclaration): boolean {
  if (node.importKind === 'type') {
    return true;
  }
  return (
    node.specifiers.length > 0 &&
    node.specifiers.every(
      (specifier) => 'importKind' in specifier && specifier.importKind === 'type',
    )
  );
}

function importSpecifierName(specifier: ESTree.Node): string | null {
  return specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : null;
}

function isTypeOnlySpecifier(specifier: ESTree.Node): boolean {
  return 'importKind' in specifier && specifier.importKind === 'type';
}

export function exportedNames(node: ESTree.ExportNamedDeclaration): string[] {
  const declaration = node.declaration;
  if (
    declaration !== null &&
    (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
    declaration.id?.type === 'Identifier'
  ) {
    return [declaration.id.name];
  }
  if (declaration?.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap((item) =>
      item.id.type === 'Identifier' ? [item.id.name] : [],
    );
  }
  return node.specifiers.flatMap((specifier) =>
    specifier.exported.type === 'Identifier' ? [specifier.exported.name] : [],
  );
}

export function isDdlLiteral(node: ESTree.Node): boolean {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return ddlPattern.test(node.value);
  }
  return node.type === 'TemplateElement' && ddlPattern.test(node.value.raw);
}

function importSources(node: ESTree.ImportDeclaration): {
  source: string | null;
  runtimeSource: string | null;
} {
  const source = importSource(node);
  return {
    source,
    runtimeSource: source === null || isTypeOnlyImport(node) ? null : source,
  };
}

export function inspectImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  flags: SqliteFileFlags,
  relativePath: string,
  databaseDirectory: string,
): void {
  const { source, runtimeSource } = importSources(node);
  if (source === null) return;
  if (
    runtimeSource === 'bun:sqlite' &&
    !flags.isDatabaseInfrastructure &&
    !flags.isTestDatabaseSetup
  ) {
    context.report({ node: node.source, messageId: 'driver' });
  }
  if (
    importsDatabaseModule(relativePath, source, databaseDirectory, 'connection') &&
    flags.isSystemFile &&
    !flags.isDatabaseInfrastructure
  ) {
    context.report({ node: node.source, messageId: 'connection' });
  }
  if (flags.isDaoFile && daoImportPattern.test(source)) {
    context.report({ node: node.source, messageId: 'daoImport' });
  }
}

function recordBunTestBindings(node: ESTree.ImportDeclaration, bindings: SqliteTestBindings): void {
  for (const specifier of node.specifiers) {
    if (isTypeOnlySpecifier(specifier)) {
      continue;
    }
    if (specifier.type === 'ImportNamespaceSpecifier') {
      bindings.namespaces.add(specifier.local.name);
      continue;
    }
    const imported = importSpecifierName(specifier);
    if (imported !== null && bunTestApiNames.has(imported)) {
      bindings.apis.add(specifier.local.name);
    }
  }
}

function inspectManagedTestDatabaseImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  source: string,
  flags: SqliteTestFileFlags,
  state: SqliteTestState,
): void {
  if (!testDatabaseHelperImportPattern.test(source)) {
    return;
  }
  const hasDisallowedImport = node.specifiers.some(
    (specifier) =>
      specifier.type !== 'ImportSpecifier' ||
      importSpecifierName(specifier) !== publicTestDatabaseExportName,
  );
  const isCanonical = canonicalTestDatabaseImportPattern.test(source);
  if (hasDisallowedImport || !isCanonical) {
    context.report({ node: node.source, messageId: 'testImport' });
  }
  if (
    !isTypeOnlyImport(node) &&
    isCanonical &&
    node.specifiers.some(
      (specifier) => importSpecifierName(specifier) === publicTestDatabaseExportName,
    )
  ) {
    state.usesManagedHook = true;
  }
  if (flags.isUnitTest) {
    context.report({ node: node.source, messageId: 'unitImport' });
  }
}

function importsPrivateConnectionControl(node: ESTree.ImportDeclaration): boolean {
  if (isTypeOnlyImport(node)) {
    return false;
  }
  return node.specifiers.some((specifier) => {
    if (specifier.type === 'ImportNamespaceSpecifier') {
      return true;
    }
    const imported = importSpecifierName(specifier);
    return imported !== null && privateConnectionExportNames.has(imported);
  });
}

function inspectTestInfrastructureImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  source: string,
  flags: SqliteTestFileFlags,
  relativePath: string,
  databaseDirectory: string,
): void {
  if (flags.isManagedSetup) {
    return;
  }
  if (
    importsDatabaseModule(relativePath, source, databaseDirectory, 'migrate') ||
    (importsDatabaseModule(relativePath, source, databaseDirectory, 'connection') &&
      importsPrivateConnectionControl(node))
  ) {
    context.report({ node: node.source, messageId: 'infrastructure' });
  }
}

type TestImportInspection = {
  flags: SqliteTestFileFlags;
  state: SqliteTestState;
  bindings: SqliteTestBindings;
  relativePath: string;
  databaseDirectory: string;
};

export function inspectTestImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  input: TestImportInspection,
): void {
  const { flags, state, bindings, relativePath, databaseDirectory } = input;
  const { source, runtimeSource } = importSources(node);
  if (source === null) return;
  if (runtimeSource === 'bun:test') {
    recordBunTestBindings(node, bindings);
  }
  inspectManagedTestDatabaseImport(context, node, source, flags, state);
  inspectTestInfrastructureImport(context, node, source, flags, relativePath, databaseDirectory);
}

function isBunTestApiReference(node: ESTree.Node, bindings: SqliteTestBindings): boolean {
  if (node.type === 'Identifier') {
    return bindings.apis.has(node.name);
  }
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    bindings.namespaces.has(node.object.name) &&
    node.property.type === 'Identifier' &&
    bunTestApiNames.has(node.property.name)
  );
}

export function isConcurrentTestReference(
  node: ESTree.Node,
  bindings: SqliteTestBindings,
): boolean {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'concurrent' &&
    isBunTestApiReference(node.object, bindings)
  );
}
