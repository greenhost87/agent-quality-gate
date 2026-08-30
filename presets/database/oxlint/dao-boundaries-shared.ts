import type { Context, ESTree } from '@oxlint/plugins';

export const daoImplementationPattern = /\.dao\.ts$/u;
export const daoFilePattern = /\.dao(?:\.[^/]+)*\.ts$/u;
export const daoImportPattern = /\.dao(?:\.ts)?$/u;
export const productionDaoBindingImportPattern = /\.dao(?:\.[cm]?[jt]s)?$/u;
export const connectionFilePattern = /(?:^|\/)connection(?:\.types)?\.ts$/u;
export const databaseConnectionImportPattern = /(?:^|\/)database\/connection(?:\.[cm]?[jt]s)?$/u;
export const managedTestDatabasePath = 'tests/setup/testDatabase.ts';
export const managedTestDatabaseBootstrapPath = 'tests/setup/testDatabase.bootstrap.ts';
export const managedMigratePath = 'system/database/migrate.ts';
export const managedMigrateSatellitePattern = /^system\/database\/migrate[-.].+\.ts$/u;
export const testFilePattern = /(?:^|\/)(?:specs|tests|__tests__)(?:\/|$)|\.(?:spec|test)\.[^/]+$/u;
export const validDaoPlacementPattern = /^[^/]+\/[^/]+\.dao(?:\.[^/]+)*\.ts$/u;
export const testsDirectoryPattern = /(?:^|\/)tests\//u;
export const e2eDirectoryPattern = /(?:^|\/)e2e\//u;
export const unitTestsDirectoryPattern = /(?:^|\/)tests\/unit\//u;
export const testDatabaseImportPattern = /(?:^|\/)testDatabase(?:\.[cm]?[jt]s)?$/u;
export const migrationImportPattern = /(?:^|\/)database\/migrate(?:\.[cm]?[jt]s)?$/u;
export const migrationPathPattern = /^migrations\//u;
export const bunTestApiNames = new Set(['test', 'it', 'describe']);
export const genericTestDatabaseInterfaceNames = new Set([
  'queryTestDatabase',
  'executeTestDatabaseQuery',
  'getClient',
  'sql',
  'pool',
]);
export const publicTestDatabaseExportNames = new Set(['useIsolatedTestDatabase']);

const sqlDdlPattern = /^\s*(?:CREATE(?:\s+OR\s+REPLACE)?|ALTER|DROP)\s+/iu;
const managedAdministrativeDdlPattern = /^\s*(?:CREATE|DROP)\s+DATABASE\b/iu;
const managedMigrationLedgerDdlPattern =
  /^\s*CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+schema_migrations\b/iu;
const daoClassNamePattern = /^[A-Z][A-Za-z0-9]*Dao$/u;

export function normalizedFilename(context: Context): string {
  return context.filename.replaceAll('\\', '/');
}

export function projectPath(context: Context): string {
  const root = context.cwd.replaceAll('\\', '/');
  const filename = normalizedFilename(context);
  return filename.startsWith(`${root}/`) ? filename.slice(root.length + 1) : filename;
}

export function daoFunctionDefault(node: ESTree.Node): boolean {
  let current: ESTree.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      parent.type === 'FunctionDeclaration' ||
      parent.type === 'FunctionExpression' ||
      parent.type === 'ArrowFunctionExpression'
    ) {
      return (parent.params as ESTree.Node[]).includes(current);
    }
    if (
      parent.type !== 'AssignmentPattern' &&
      parent.type !== 'RestElement' &&
      parent.type !== 'TSParameterProperty'
    ) {
      return false;
    }
    current = parent;
  }
  return false;
}

export function importSpecifierName(specifier: ESTree.Node): string | null {
  return specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : null;
}

export function importSource(node: ESTree.ImportDeclaration): string | null {
  return typeof node.source.value === 'string' ? node.source.value : null;
}

export function findImportedSpecifier(
  node: ESTree.ImportDeclaration,
  name: string,
): ESTree.Node | undefined {
  return node.specifiers.find((specifier) => importSpecifierName(specifier) === name);
}

function importsOnly(node: ESTree.ImportDeclaration, names: readonly string[]): boolean {
  return (
    node.specifiers.length > 0 &&
    node.specifiers.every((specifier) => names.includes(importSpecifierName(specifier) ?? ''))
  );
}

export function isTypeOnlyImport(node: ESTree.ImportDeclaration): boolean {
  return node.importKind === 'type';
}

export function isTypeOnlySpecifier(specifier: ESTree.Node): boolean {
  return 'importKind' in specifier && specifier.importKind === 'type';
}

export function isDatabaseLifecycleImport(node: ESTree.ImportDeclaration): boolean {
  return importsOnly(node, ['closeDatabase']);
}

export function isTestDatabaseInfrastructureImport(
  node: ESTree.ImportDeclaration,
  source: string | null,
): boolean {
  const importsDatabaseLifecycle =
    source &&
    databaseConnectionImportPattern.test(source) &&
    findImportedSpecifier(node, 'closeDatabase');
  return (
    source === 'pg' ||
    source === '@testcontainers/postgresql' ||
    source === 'testcontainers' ||
    source === 'node-pg-migrate' ||
    (source !== null && migrationImportPattern.test(source)) ||
    Boolean(importsDatabaseLifecycle)
  );
}

export function exportNames(node: ESTree.ExportNamedDeclaration): string[] {
  const declaration = node.declaration;
  if (
    declaration &&
    (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
    declaration.id?.type === 'Identifier'
  ) {
    return [declaration.id.name];
  }
  if (node.declaration?.type === 'VariableDeclaration') {
    return node.declaration.declarations.flatMap((declaration) =>
      declaration.id.type === 'Identifier' ? [declaration.id.name] : [],
    );
  }
  return node.specifiers.flatMap((specifier) => {
    const names: string[] = [];
    if (specifier.local.type === 'Identifier') names.push(specifier.local.name);
    if (specifier.exported.type === 'Identifier') names.push(specifier.exported.name);
    return names;
  });
}

function stringNodeMatches(node: ESTree.Node, pattern: RegExp): boolean {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return pattern.test(node.value);
  }
  return node.type === 'TemplateElement' && pattern.test(node.value.raw);
}

function isSqlDdlLiteral(node: ESTree.Node): boolean {
  return stringNodeMatches(node, sqlDdlPattern);
}

function isManagedAdministrativeDdlLiteral(node: ESTree.Node): boolean {
  return stringNodeMatches(node, managedAdministrativeDdlPattern);
}

function isManagedMigrationLedgerDdlLiteral(node: ESTree.Node): boolean {
  return stringNodeMatches(node, managedMigrationLedgerDdlPattern);
}

export function createsPostgreSqlContainer(node: ESTree.Node): boolean {
  return (
    node.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'PostgreSqlContainer'
  );
}

export function isInsideCallbackOf(
  node: ESTree.Node,
  isTargetCallee: (callee: ESTree.Expression | ESTree.Super) => boolean,
): boolean {
  let current: ESTree.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') &&
      parent.parent.type === 'CallExpression' &&
      isTargetCallee(parent.parent.callee) &&
      parent.parent.arguments.includes(parent)
    ) {
      return true;
    }
    current = parent;
  }
  return false;
}

export function isIdentifierReference(node: ESTree.Node): boolean {
  if (node.type !== 'Identifier') {
    return false;
  }
  const parent = node.parent;
  if (isImportBindingIdentifier(parent, node)) {
    return false;
  }
  if (isNonComputedPropertyIdentifier(parent, node)) {
    return false;
  }
  if (isFunctionNameIdentifier(parent, node)) {
    return false;
  }
  if (parent.type === 'VariableDeclarator' && parent.id === node) {
    return false;
  }
  return true;
}

function isImportBindingIdentifier(parent: ESTree.Node, node: ESTree.Node): boolean {
  if (parent.type === 'ImportSpecifier' && (parent.imported === node || parent.local === node)) {
    return true;
  }
  if (parent.type === 'ImportDefaultSpecifier' && parent.local === node) {
    return true;
  }
  return parent.type === 'ImportNamespaceSpecifier' && parent.local === node;
}

function isNonComputedPropertyIdentifier(parent: ESTree.Node, node: ESTree.Node): boolean {
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
    return true;
  }
  if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) {
    return true;
  }
  return parent.type === 'MethodDefinition' && parent.key === node && !parent.computed;
}

function isFunctionNameIdentifier(parent: ESTree.Node, node: ESTree.Node): boolean {
  return (
    (parent.type === 'FunctionDeclaration' ||
      parent.type === 'FunctionExpression' ||
      parent.type === 'ArrowFunctionExpression') &&
    parent.id === node
  );
}

export function reportDatabaseDriverImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  source: string | null,
  isDatabaseFile: boolean,
  isTestDatabaseSetup: boolean,
): void {
  if (source === 'pg' && !isDatabaseFile && !isTestDatabaseSetup) {
    context.report({ node: node.source, messageId: 'database' });
  }
}

export function reportInvalidImportSpecifier(
  context: Context,
  specifier: ESTree.Node | undefined,
  isInvalid: boolean,
  messageId: string,
): void {
  if (specifier && isInvalid) {
    context.report({ node: specifier, messageId });
  }
}

export function reportConnectionImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  source: string | null,
  isDatabaseFile: boolean,
  isLifecycleImport: boolean,
  databaseAccessIsInvalid: boolean,
): void {
  if (
    source &&
    databaseConnectionImportPattern.test(source) &&
    !isDatabaseFile &&
    !isLifecycleImport &&
    !databaseAccessIsInvalid
  ) {
    context.report({ node: node.source, messageId: 'connection' });
  }
}

export function reportDaoImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  source: string | null,
  isProductionDaoImplementation: boolean,
): void {
  if (source && isProductionDaoImplementation && daoImportPattern.test(source)) {
    context.report({ node: node.source, messageId: 'dao' });
  }
}

export function reportSqlDdl(
  context: Context,
  node: ESTree.Node,
  isMigrationPath: boolean,
  isTestDatabaseSetup: boolean,
  isManagedMigrate: boolean,
): void {
  if (!isSqlDdlLiteral(node)) return;
  if (isMigrationPath) return;
  if (isManagedMigrate && isManagedMigrationLedgerDdlLiteral(node)) return;
  if (isTestDatabaseSetup && isManagedAdministrativeDdlLiteral(node)) return;
  context.report({ node, messageId: 'ddl' });
}

export function isDaoClassName(name: string | undefined): name is string {
  return typeof name === 'string' && daoClassNamePattern.test(name);
}
