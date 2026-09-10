import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import type { DaoScanFlags } from './dao-boundaries.ts';
import {
  inspectDaoModuleShape,
  reportDaoProgramFlags,
  reportIllegalDaoConstruct,
  requiresBroadDaoScan,
} from './dao-boundaries-inspect.ts';
import {
  collectFunctionBinding,
  inspectDaoOperationUsage,
  programUsesDaoOperations,
} from './dao-operation-usage.ts';
import type { FunctionBinding } from './dao-operation-usage.ts';
import {
  collectSqlLocalNames,
  connectionFilePattern,
  databaseResultHelperPattern,
  daoFilePattern,
  daoFunctionDefault,
  daoImplementationPattern,
  findImportedSpecifier,
  importSource,
  isDatabaseLifecycleImport,
  isModuleScopeSqlUse,
  isUnsafeSqlMember,
  managedMigratePath,
  managedMigrateSatellitePattern,
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
  sqlResultUsesCountMetadata,
  testFilePattern,
  validDaoPlacementPattern,
} from './dao-boundaries-shared.ts';
import { isAstNode } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

function buildDaoScanFlags(context: Context): DaoScanFlags {
  const filename = normalizedFilename(context);
  const relativePath = projectPath(context);
  const databaseMarker = '/system/database/';
  const databaseFileIndex = filename.indexOf(databaseMarker);
  const isDatabaseFile = databaseFileIndex >= 0;
  const databaseRelativePath = isDatabaseFile
    ? filename.slice(databaseFileIndex + databaseMarker.length)
    : '';
  return {
    isDatabaseFile,
    isConnectionFile: connectionFilePattern.test(filename),
    isTestDatabaseSetup:
      relativePath === managedTestDatabasePath || relativePath === managedTestDatabaseBootstrapPath,
    isManagedMigrate: relativePath === managedMigratePath,
    isManagedMigrateSatellite: managedMigrateSatellitePattern.test(relativePath),
    isDatabaseResultHelper: databaseResultHelperPattern.test(relativePath),
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
      migrateSatellite:
        'Keep the migration runner in system/database/migrate.ts; do not create satellite files such as migrate-cli.ts or migrate.types.ts.',
      databaseAccess: 'Import sql only from production *.dao.ts database implementations.',
      legacyDatabaseAccess: 'Import sql instead of the removed getDatabase accessor.',
      daoClass: 'Use named DAO functions instead of classes.',
      daoConstruct: 'Do not construct DAO classes; import named DAO functions.',
      daoDefault: 'DAO functions must not use default parameter values.',
      daoExport:
        'DAO implementation modules may export only named function declarations and types.',
      daoOperationFacade: 'Do not export object facades backed by DAO operations.',
      daoOperationValue:
        'Invoke DAO operations directly; do not expose them as values or re-export them.',
      daoResultHelper:
        'Do not create database result-helper modules. Inline rows[0] ?? null in the DAO; for mutation not-found checks, use RETURNING and rows.length.',
      sqlCountMetadata:
        'Do not rely on Bun SQL count metadata. Add RETURNING to the mutation and inspect the returned rows.',
      unsafeSql:
        'Do not use Bun SQL unsafe outside managed database infrastructure. Use tagged templates and SQL fragments.',
      moduleScopeSql:
        'Construct SQL queries and fragments inside DAO functions; do not use sql at module scope.',
      database:
        'Import the database driver only from system/database or tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
      placement:
        'DAO files must be inside system/database/<domain> with exactly one domain directory.',
      testDao: 'DAO implementation files are not allowed in tests.',
      ddl: 'Schema DDL is allowed only in migrations/, as managed CREATE TABLE IF NOT EXISTS schema_migrations in system/database/migrate.ts, or as managed CREATE/DROP DATABASE in tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
    },
  },
  createOnce(context) {
    let flags: DaoScanFlags = {
      isDatabaseFile: false,
      isConnectionFile: false,
      isTestDatabaseSetup: false,
      isManagedMigrate: false,
      isManagedMigrateSatellite: false,
      isDatabaseResultHelper: false,
      isTestFile: false,
      isDaoFile: false,
      isProductionDaoImplementation: false,
      isTestDaoImplementation: false,
      hasValidDaoPlacement: false,
      isMigrationPath: false,
    };
    let sqlLocalNames: ReadonlySet<string> = new Set();
    let inspectOperationUsage = false;
    let broadScan = false;
    let functionBindings: FunctionBinding[] = [];

    function parentOf(node: ESTree.Node): ESTree.Node | null {
      const ancestors = context.sourceCode.getAncestors(node);
      const parent: unknown = ancestors[ancestors.length - 1];
      return isAstNode(parent) ? parent : null;
    }

    function inspectImportDeclaration(node: ESTree.ImportDeclaration): void {
      const source = importSource(node);
      const databaseAccessSpecifier = findImportedSpecifier(node, 'sql');
      const legacyDatabaseAccessSpecifier = findImportedSpecifier(node, 'getDatabase');
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
      reportInvalidImportSpecifier(
        context,
        legacyDatabaseAccessSpecifier,
        Boolean(legacyDatabaseAccessSpecifier),
        'legacyDatabaseAccess',
      );
      reportConnectionImport(
        context,
        node,
        source,
        flags.isDatabaseFile,
        isLifecycleImport,
        databaseAccessIsInvalid || Boolean(legacyDatabaseAccessSpecifier),
      );
      reportDaoImport(context, node, source, flags.isProductionDaoImplementation);
    }

    function maybeReportModuleScopeSql(node: ESTree.Node): void {
      if (
        flags.isProductionDaoImplementation &&
        isModuleScopeSqlUse(node, sqlLocalNames, parentOf)
      ) {
        context.report({ node, messageId: 'moduleScopeSql' });
      }
    }

    function maybeCollectFunctionBinding(node: ESTree.Node): void {
      if (!inspectOperationUsage) {
        return;
      }
      const binding = collectFunctionBinding(context, node);
      if (binding != null) {
        functionBindings.push(binding);
      }
    }

    function visitFunctionBindingCandidate(node: ESTree.Node): void {
      if (broadScan) {
        maybeCollectFunctionBinding(node);
      }
    }

    function visitSqlDdlCandidate(node: ESTree.Node): void {
      if (!broadScan) {
        return;
      }
      reportSqlDdl(
        context,
        node,
        flags.isMigrationPath,
        flags.isTestDatabaseSetup,
        flags.isManagedMigrate,
      );
    }

    return {
      before() {
        flags = buildDaoScanFlags(context);
        const program = context.sourceCode.ast;
        sqlLocalNames = collectSqlLocalNames(program);
        inspectOperationUsage = programUsesDaoOperations(program);
        broadScan = requiresBroadDaoScan(context, flags, inspectOperationUsage);
        functionBindings = [];
        return undefined;
      },
      Program(node) {
        reportDaoProgramFlags(context, node, flags);
      },
      ImportDeclaration(node) {
        inspectImportDeclaration(node);
      },
      AssignmentPattern(node) {
        if (!broadScan) {
          return;
        }
        if (flags.isProductionDaoImplementation && daoFunctionDefault(node, parentOf)) {
          context.report({ node, messageId: 'daoDefault' });
        }
      },
      CallExpression(node) {
        if (!broadScan) {
          return;
        }
        maybeReportModuleScopeSql(node);
      },
      ClassDeclaration(node) {
        if (!broadScan) {
          return;
        }
        inspectDaoModuleShape(context, node, flags);
      },
      ClassExpression(node) {
        if (!broadScan) {
          return;
        }
        inspectDaoModuleShape(context, node, flags);
      },
      ExportAllDeclaration(node) {
        if (!broadScan) {
          return;
        }
        inspectDaoModuleShape(context, node, flags);
      },
      ExportDefaultDeclaration(node) {
        if (!broadScan) {
          return;
        }
        inspectDaoModuleShape(context, node, flags);
      },
      ExportNamedDeclaration(node) {
        if (!broadScan) {
          return;
        }
        inspectDaoModuleShape(context, node, flags);
      },
      FunctionDeclaration(node) {
        visitFunctionBindingCandidate(node);
      },
      Literal(node) {
        visitSqlDdlCandidate(node);
      },
      MemberExpression(node) {
        if (!broadScan) {
          return;
        }
        maybeReportModuleScopeSql(node);
        if (
          !flags.isManagedMigrate &&
          !flags.isTestDatabaseSetup &&
          isUnsafeSqlMember(node, sqlLocalNames)
        ) {
          context.report({ node, messageId: 'unsafeSql' });
        }
      },
      NewExpression(node) {
        if (!broadScan) {
          return;
        }
        reportIllegalDaoConstruct(context, node);
      },
      TaggedTemplateExpression(node) {
        if (!broadScan) {
          return;
        }
        maybeReportModuleScopeSql(node);
        if (
          flags.isDatabaseFile &&
          !flags.isConnectionFile &&
          !flags.isManagedMigrate &&
          sqlResultUsesCountMetadata(node)
        ) {
          context.report({ node, messageId: 'sqlCountMetadata' });
        }
      },
      TemplateElement(node) {
        visitSqlDdlCandidate(node);
      },
      VariableDeclarator(node) {
        visitFunctionBindingCandidate(node);
      },
      after() {
        if (inspectOperationUsage) {
          inspectDaoOperationUsage(context, context.sourceCode.ast, functionBindings);
        }
      },
    };
  },
});
