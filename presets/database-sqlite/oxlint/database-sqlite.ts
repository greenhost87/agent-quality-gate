import {
  definePlugin,
  defineRule,
  eslintCompatPlugin,
  type Context,
  type ESTree,
} from '@oxlint/plugins';

import { walkAstSkippingTypeAndJsxMarkup } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

const daoFilePattern = /\.dao(?:\.[^/]+)*\.[cm]?[jt]s$/u;
const daoImportPattern = /\.dao(?:\.[^/]+)*(?:\.[cm]?[jt]s)?$/u;
const validDaoPlacementPattern = /^system\/database\/[^/]+\/[^/]+\.dao(?:\.[^/]+)*\.[cm]?[jt]s$/u;
const connectionImportPattern = /(?:^|\/)system\/database\/connection(?:\.[cm]?[jt]s)?$/u;
const migrationImportPattern = /(?:^|\/)system\/database\/migrate(?:\.[cm]?[jt]s)?$/u;
const canonicalTestDatabaseImportPattern = /(?:^|\/)testDatabase(?:\.[cm]?[jt]s)?$/u;
const testDatabaseHelperImportPattern =
  /(?:^|\/)(?:testDatabase|test-database|test_database)(?:\.[cm]?[jt]s)?$/u;
const testDatabaseSetupPath = 'tests/setup/testDatabase.ts';
const testFilePattern = /^tests\//u;
const unitTestFilePattern = /^tests\/unit\//u;
const ddlPattern = /^\s*(?:CREATE(?:\s+OR\s+REPLACE)?|ALTER|DROP)\s+/iu;
const bunTestApiNames = new Set(['describe', 'it', 'test']);
const publicTestDatabaseExportName = 'useIsolatedTestDatabase';
const privateConnectionExportNames = new Set([
  'installDatabaseForTests',
  'releaseDatabaseForTests',
]);

function projectPath(context: Context): string {
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

function importSource(node: ESTree.ImportDeclaration): string | null {
  return typeof node.source.value === 'string' ? node.source.value : null;
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

function exportedNames(node: ESTree.ExportNamedDeclaration): string[] {
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

function isDdlLiteral(node: ESTree.Node): boolean {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return ddlPattern.test(node.value);
  }
  return node.type === 'TemplateElement' && ddlPattern.test(node.value.raw);
}

function inspectImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  flags: SqliteFileFlags,
): void {
  const source = importSource(node);
  if (source === null) {
    return;
  }
  if (
    source === 'bun:sqlite' &&
    !isTypeOnlyImport(node) &&
    !flags.isDatabaseInfrastructure &&
    !flags.isTestDatabaseSetup
  ) {
    context.report({ node: node.source, messageId: 'driver' });
  }
  if (
    connectionImportPattern.test(source) &&
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
  isManagedSetup: boolean,
): void {
  if (isManagedSetup) {
    return;
  }
  if (
    migrationImportPattern.test(source) ||
    (connectionImportPattern.test(source) && importsPrivateConnectionControl(node))
  ) {
    context.report({ node: node.source, messageId: 'infrastructure' });
  }
}

function inspectTestImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  flags: SqliteTestFileFlags,
  state: SqliteTestState,
  bindings: SqliteTestBindings,
): void {
  const source = importSource(node);
  if (source === null) {
    return;
  }
  if (source === 'bun:test' && !isTypeOnlyImport(node)) {
    recordBunTestBindings(node, bindings);
  }
  inspectManagedTestDatabaseImport(context, node, source, flags, state);
  inspectTestInfrastructureImport(context, node, source, flags.isManagedSetup);
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

function isConcurrentTestReference(node: ESTree.Node, bindings: SqliteTestBindings): boolean {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'concurrent' &&
    isBunTestApiReference(node.object, bindings)
  );
}

const boundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      connection:
        'Compose the SQLite connection outside system modules; inject Database into services instead of importing system/database/connection.',
      daoImport: 'DAO implementation modules must not import other DAO implementation modules.',
      ddl: 'Schema DDL is allowed only in migrations/, system/database/migrate.ts, or tests/setup/testDatabase.ts.',
      driver:
        'Import the bun:sqlite runtime only from managed database infrastructure; type-only imports are allowed for dependency injection.',
      placement:
        'DAO files must be inside system/database/<domain> with exactly one domain directory.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const relativePath = projectPath(context);
        const flags: SqliteFileFlags = {
          isDatabaseInfrastructure:
            relativePath === 'system/database/connection.ts' ||
            relativePath === 'system/database/migrate.ts',
          isDaoFile: daoFilePattern.test(relativePath),
          isMigrationRunner: relativePath === 'system/database/migrate.ts',
          isSystemFile: relativePath.startsWith('system/'),
          isTestDatabaseSetup: relativePath === testDatabaseSetupPath,
        };

        if (flags.isDaoFile && !validDaoPlacementPattern.test(relativePath)) {
          context.report({ node: context.sourceCode.ast, messageId: 'placement' });
        }

        walkAstSkippingTypeAndJsxMarkup(context.sourceCode.ast, (node) => {
          if (node.type === 'ImportDeclaration') {
            inspectImport(context, node, flags);
            return;
          }
          if (
            (node.type === 'Literal' || node.type === 'TemplateElement') &&
            isDdlLiteral(node) &&
            !flags.isMigrationRunner &&
            !flags.isTestDatabaseSetup
          ) {
            context.report({ node, messageId: 'ddl' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});

const testBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      concurrent: 'Concurrent Bun tests are not allowed in files that use useIsolatedTestDatabase.',
      infrastructure:
        'SQLite migration and test connection infrastructure is available only from tests/setup/testDatabase.ts.',
      testExport: 'testDatabase.ts may export only useIsolatedTestDatabase.',
      testImport: 'Import only useIsolatedTestDatabase from tests/setup/testDatabase.ts.',
      unitImport: 'Unit tests must not import tests/setup/testDatabase.ts.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const relativePath = projectPath(context);
        const flags: SqliteTestFileFlags = {
          isManagedSetup: relativePath === testDatabaseSetupPath,
          isTestFile: testFilePattern.test(relativePath),
          isUnitTest: unitTestFilePattern.test(relativePath),
        };
        if (!flags.isManagedSetup && !flags.isTestFile) {
          return false;
        }

        const state: SqliteTestState = { usesManagedHook: false };
        const bindings: SqliteTestBindings = { apis: new Set(), namespaces: new Set() };
        const concurrentReferences: ESTree.Node[] = [];
        walkAstSkippingTypeAndJsxMarkup(context.sourceCode.ast, (node) => {
          if (node.type === 'ImportDeclaration') {
            inspectTestImport(context, node, flags, state, bindings);
            return;
          }
          if (flags.isManagedSetup) {
            if (node.type === 'ExportAllDeclaration' || node.type === 'ExportDefaultDeclaration') {
              context.report({ node, messageId: 'testExport' });
            } else if (
              node.type === 'ExportNamedDeclaration' &&
              exportedNames(node).some((name) => name !== publicTestDatabaseExportName)
            ) {
              context.report({ node, messageId: 'testExport' });
            }
          }
          if (node.type === 'MemberExpression') {
            concurrentReferences.push(node);
          }
        });

        if (state.usesManagedHook) {
          for (const node of concurrentReferences) {
            if (isConcurrentTestReference(node, bindings)) {
              context.report({ node, messageId: 'concurrent' });
            }
          }
        }
        return false;
      },
      Program() {},
    };
  },
});

export default eslintCompatPlugin(
  definePlugin({
    meta: {
      name: 'database-sqlite',
    },
    rules: {
      boundaries,
      'test-boundaries': testBoundaries,
    },
  }),
);

type SqliteFileFlags = {
  isDatabaseInfrastructure: boolean;
  isDaoFile: boolean;
  isMigrationRunner: boolean;
  isSystemFile: boolean;
  isTestDatabaseSetup: boolean;
};

type SqliteTestFileFlags = {
  isManagedSetup: boolean;
  isTestFile: boolean;
  isUnitTest: boolean;
};

type SqliteTestState = {
  usesManagedHook: boolean;
};

type SqliteTestBindings = {
  apis: Set<string>;
  namespaces: Set<string>;
};
