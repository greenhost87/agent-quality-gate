import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import type { DaoScanFlags } from './dao-boundaries.types.ts';
import {
  connectionFilePattern,
  daoFilePattern,
  daoImplementationPattern,
  daoMethodDefault,
  exportedDaoClassDeclarations,
  exportedDaoSingletonClassNames,
  findImportedSpecifier,
  importSource,
  isDaoClassName,
  isDaoSingletonExport,
  isDatabaseLifecycleImport,
  managedMigratePath,
  managedTestDatabaseBootstrapPath,
  managedTestDatabasePath,
  migrationPathPattern,
  normalizedFilename,
  projectPath,
  reportConnectionImport,
  reportDaoImport,
  reportDatabaseDriverImport,
  reportInvalidImportSpecifier,
  reportSqlDdl,
  testFilePattern,
  validDaoPlacementPattern,
} from './dao-boundaries-shared.ts';
import { walkAst } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

function reportDaoProgramFlags(context: Context, node: ESTree.Program, flags: DaoScanFlags): void {
  if (flags.isConnectionFile && !flags.isDatabaseFile) {
    context.report({ node, messageId: 'connectionPlacement' });
  }
  if (flags.isDaoFile && (!flags.isDatabaseFile || !flags.hasValidDaoPlacement)) {
    context.report({ node, messageId: 'placement' });
  }
  if (flags.isTestDaoImplementation) {
    context.report({ node, messageId: 'testDao' });
  }
}

function reportMissingDaoSingletons(context: Context, node: ESTree.Program): void {
  const singletons = exportedDaoSingletonClassNames(node);
  for (const declaration of exportedDaoClassDeclarations(node)) {
    if (declaration.type !== 'ClassDeclaration' || declaration.id?.type !== 'Identifier') {
      continue;
    }
    if (!singletons.has(declaration.id.name)) {
      context.report({ node: declaration.id, messageId: 'daoSingleton' });
    }
  }
}

function reportIllegalDaoConstruct(
  context: Context,
  node: ESTree.NewExpression,
  flags: DaoScanFlags,
): void {
  if (node.callee.type !== 'Identifier' || !isDaoClassName(node.callee.name)) {
    return;
  }
  if (
    flags.isProductionDaoImplementation &&
    node.parent.type === 'VariableDeclarator' &&
    isDaoSingletonExport(node.parent, node.callee.name)
  ) {
    return;
  }
  context.report({ node, messageId: 'daoConstruct' });
}

export const daoBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      dao: 'DAO implementation modules must not import other DAO implementation modules.',
      connection:
        'Import only database lifecycle functions from system/database/connection outside system/database.',
      connectionPlacement: 'Connection files must be inside system/database.',
      databaseAccess: 'Import getDatabase only from production *.dao.ts database implementations.',
      daoConstruct:
        'Construct DAO classes only as the exported module singleton inside their production *.dao.ts file.',
      daoDefault: 'DAO methods must not use default parameter values.',
      daoSingleton:
        'Export a module singleton const matching the DAO class name in camelCase (OrdersDao → ordersDao).',
      database:
        'Import the database driver only from system/database or tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
      placement:
        'DAO files must be inside system/database/<domain> with exactly one domain directory.',
      testDao: 'DAO implementation files are not allowed in tests.',
      ddl: 'Schema DDL is allowed only in migrations/, as managed CREATE TABLE IF NOT EXISTS schema_migrations in system/database/migrate.ts, or as managed CREATE/DROP DATABASE in tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
    },
  },
  createOnce(context) {
    function inspectImportDeclaration(node: ESTree.ImportDeclaration, flags: DaoScanFlags): void {
      const source = importSource(node);
      const databaseAccessSpecifier = findImportedSpecifier(node, 'getDatabase');
      const isLifecycleImport = isDatabaseLifecycleImport(node);
      const databaseAccessIsInvalid =
        Boolean(databaseAccessSpecifier) && !flags.isProductionDaoImplementation;

      reportDatabaseDriverImport(
        context,
        node,
        source,
        flags.isDatabaseFile,
        flags.isTestDatabaseSetup,
      );
      reportInvalidImportSpecifier(
        context,
        databaseAccessSpecifier,
        databaseAccessIsInvalid,
        'databaseAccess',
      );
      reportConnectionImport(
        context,
        node,
        source,
        flags.isDatabaseFile,
        isLifecycleImport,
        databaseAccessIsInvalid,
      );
      reportDaoImport(context, node, source, flags.isProductionDaoImplementation);
    }

    function inspect(node: ESTree.Node, flags: DaoScanFlags): void {
      switch (node.type) {
        case 'AssignmentPattern':
          if (flags.isProductionDaoImplementation && daoMethodDefault(node)) {
            context.report({ node, messageId: 'daoDefault' });
          }
          break;
        case 'ImportDeclaration':
          inspectImportDeclaration(node, flags);
          break;
        case 'Literal':
          reportSqlDdl(
            context,
            node,
            flags.isMigrationPath,
            flags.isTestDatabaseSetup,
            flags.isManagedMigrate,
          );
          break;
        case 'NewExpression':
          reportIllegalDaoConstruct(context, node, flags);
          break;
        case 'TemplateElement':
          reportSqlDdl(
            context,
            node,
            flags.isMigrationPath,
            flags.isTestDatabaseSetup,
            flags.isManagedMigrate,
          );
          break;
        default:
          break;
      }
    }

    return {
      before() {
        const filename = normalizedFilename(context);
        const relativePath = projectPath(context);
        const databaseMarker = '/system/database/';
        const databaseFileIndex = filename.indexOf(databaseMarker);
        const isDatabaseFile = databaseFileIndex >= 0;
        const databaseRelativePath = isDatabaseFile
          ? filename.slice(databaseFileIndex + databaseMarker.length)
          : '';
        const flags: DaoScanFlags = {
          isDatabaseFile,
          isConnectionFile: connectionFilePattern.test(filename),
          isTestDatabaseSetup:
            relativePath === managedTestDatabasePath ||
            relativePath === managedTestDatabaseBootstrapPath,
          isManagedMigrate: relativePath === managedMigratePath,
          isTestFile: testFilePattern.test(filename),
          isDaoFile: !testFilePattern.test(filename) && daoFilePattern.test(filename),
          isProductionDaoImplementation:
            isDatabaseFile &&
            !testFilePattern.test(filename) &&
            daoImplementationPattern.test(databaseRelativePath),
          isTestDaoImplementation:
            testFilePattern.test(filename) && daoImplementationPattern.test(filename),
          hasValidDaoPlacement: validDaoPlacementPattern.test(databaseRelativePath),
          isMigrationPath: migrationPathPattern.test(relativePath),
        };

        walkAst(context.sourceCode.ast, (node, parent) => {
          node.parent = parent;
          if (node.type === 'Program') {
            reportDaoProgramFlags(context, node, flags);
            if (flags.isProductionDaoImplementation) {
              reportMissingDaoSingletons(context, node);
            }
          } else {
            inspect(node, flags);
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
