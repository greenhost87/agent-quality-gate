import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import type { DaoScanFlags } from './dao-boundaries.ts';
import {
  collectFunctionBinding,
  inspectDaoOperationUsage,
  programUsesDaoOperations,
} from './dao-operation-usage.ts';
import type { FunctionBinding } from './dao-operation-usage.ts';
import {
  connectionFilePattern,
  databaseResultHelperPattern,
  daoFilePattern,
  daoFunctionDefault,
  daoImplementationPattern,
  findImportedSpecifier,
  importSource,
  isDaoClassName,
  isDatabaseLifecycleImport,
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
import {
  attachAstParent,
  walkAstSkippingTypeAndJsxMarkup,
} from '../../../scripts/oxlint-walk/oxlint-walk.ts';

function reportDaoProgramFlags(context: Context, node: ESTree.Program, flags: DaoScanFlags): void {
  if (flags.isDatabaseResultHelper) {
    context.report({ node, messageId: 'daoResultHelper' });
  }
  if (flags.isManagedMigrateSatellite) {
    context.report({ node, messageId: 'migrateSatellite' });
  }
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

function reportIllegalDaoConstruct(context: Context, node: ESTree.NewExpression): void {
  if (node.callee.type !== 'Identifier' || !isDaoClassName(node.callee.name)) {
    return;
  }
  context.report({ node, messageId: 'daoConstruct' });
}

function isAllowedDaoExport(node: ESTree.ExportNamedDeclaration): boolean {
  if (node.exportKind === 'type') {
    return true;
  }
  const declaration = node.declaration;
  if (declaration === null) {
    return (
      node.specifiers.length > 0 &&
      node.specifiers.every((specifier) => specifier.exportKind === 'type')
    );
  }
  return (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'ClassDeclaration' ||
    declaration.type === 'TSInterfaceDeclaration' ||
    declaration.type === 'TSTypeAliasDeclaration'
  );
}

function sourceMayContainDaoViolation(source: string): boolean {
  return (
    /\b[A-Z][A-Za-z0-9]*Dao\b/u.test(source) ||
    /\b(?:CREATE|ALTER|DROP)\b/iu.test(source) ||
    /\bunsafe\b/u.test(source)
  );
}

function requiresBroadDaoScan(
  context: Context,
  flags: DaoScanFlags,
  inspectOperationUsage: boolean,
): boolean {
  return (
    inspectOperationUsage ||
    flags.isDatabaseFile ||
    flags.isProductionDaoImplementation ||
    sourceMayContainDaoViolation(context.sourceCode.text)
  );
}

function inspectDaoModuleShape(context: Context, node: ESTree.Node, flags: DaoScanFlags): void {
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    if (
      flags.isProductionDaoImplementation ||
      (node.id?.type === 'Identifier' && isDaoClassName(node.id.name))
    ) {
      context.report({ node, messageId: 'daoClass' });
    }
    return;
  }
  if (!flags.isProductionDaoImplementation) {
    return;
  }
  if (node.type === 'ExportNamedDeclaration' && !isAllowedDaoExport(node)) {
    context.report({ node, messageId: 'daoExport' });
    return;
  }
  if (
    (node.type === 'ExportAllDeclaration' && node.exportKind !== 'type') ||
    node.type === 'ExportDefaultDeclaration'
  ) {
    context.report({ node, messageId: 'daoExport' });
  }
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

    function inspect(node: ESTree.Node, flags: DaoScanFlags): void {
      inspectDaoModuleShape(context, node, flags);
      switch (node.type) {
        case 'AssignmentPattern':
          if (flags.isProductionDaoImplementation && daoFunctionDefault(node)) {
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
        case 'MemberExpression':
          if (!flags.isManagedMigrate && !flags.isTestDatabaseSetup && isUnsafeSqlMember(node)) {
            context.report({ node, messageId: 'unsafeSql' });
          }
          break;
        case 'NewExpression':
          reportIllegalDaoConstruct(context, node);
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
        case 'TaggedTemplateExpression':
          if (
            flags.isDatabaseFile &&
            !flags.isConnectionFile &&
            !flags.isManagedMigrate &&
            sqlResultUsesCountMetadata(node)
          ) {
            context.report({ node, messageId: 'sqlCountMetadata' });
          }
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

        const program = context.sourceCode.ast;
        const inspectOperationUsage = programUsesDaoOperations(program);
        reportDaoProgramFlags(context, program, flags);
        for (const statement of program.body) {
          if (statement.type === 'ImportDeclaration') {
            inspectImportDeclaration(statement, flags);
          }
        }
        if (!requiresBroadDaoScan(context, flags, inspectOperationUsage)) {
          return false;
        }

        const functionBindings: FunctionBinding[] = [];
        walkAstSkippingTypeAndJsxMarkup(program, (node, parent) => {
          if (inspectOperationUsage) {
            attachAstParent(node, parent);
          }
          if (node.type === 'Program' || node.type === 'ImportDeclaration') {
            return;
          }
          inspect(node, flags);
          if (inspectOperationUsage) {
            const binding = collectFunctionBinding(context, node);
            if (binding != null) {
              functionBindings.push(binding);
            }
          }
        });
        if (inspectOperationUsage) {
          inspectDaoOperationUsage(
            context,
            context.sourceCode.ast,
            flags.isTestFile,
            functionBindings,
          );
        }
        return false;
      },
      Program() {},
    };
  },
});
