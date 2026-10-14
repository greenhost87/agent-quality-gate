import { definePlugin, defineRule, eslintCompatPlugin, type ESTree } from '@oxlint/plugins';
import {
  configuredDatabaseDirectory,
  exportedNames,
  hasValidDaoPlacement,
  inspectImport,
  inspectTestImport,
  isConcurrentTestReference,
  isDdlLiteral,
  projectPath,
  publicTestDatabaseExportName,
  testDatabaseSetupPath,
  testFilePattern,
  unitTestFilePattern,
} from './database-sqlite-rule-helpers.ts';
import type {
  SqliteFileFlags,
  SqliteTestBindings,
  SqliteTestFileFlags,
  SqliteTestState,
} from './sqlite-flags.ts';
import {
  buildSqliteFileFlags,
  isSqliteSqlCall,
  reportSqliteDdl,
} from './sqlite-boundaries-helpers.ts';

const boundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { databaseDirectory: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      connection:
        'Compose the SQLite connection outside system modules; inject Database into services instead of importing system/database/connection.',
      daoImport: 'DAO implementation modules must not import other DAO implementation modules.',
      ddl: 'Schema DDL is allowed only in migrations/, system/database/migrate.ts, or tests/setup/testDatabase.ts.',
      driver:
        'Import the bun:sqlite runtime only from managed database infrastructure; type-only imports are allowed for dependency injection.',
      placement:
        'DAO files must be inside system/database/<domain> with exactly one domain directory.',
      sql: 'Execute SQLite statements only from DAO modules in system/database/<domain>/*.dao.ts.',
    },
  },
  createOnce(context) {
    let relativePath = '';
    let databaseDirectory = 'system/database';
    let flags: SqliteFileFlags = {
      isDatabaseInfrastructure: false,
      isDaoFile: false,
      isMigrationRunner: false,
      isSystemFile: false,
      isTestDatabaseSetup: false,
    };

    return {
      before() {
        relativePath = projectPath(context);
        databaseDirectory = configuredDatabaseDirectory(context);
        flags = buildSqliteFileFlags(relativePath, databaseDirectory);
        return undefined;
      },
      Program(node) {
        if (flags.isDaoFile && !hasValidDaoPlacement(relativePath, databaseDirectory)) {
          context.report({ node, messageId: 'placement' });
        }
      },
      ImportDeclaration(node) {
        inspectImport(context, node, flags, relativePath, databaseDirectory);
      },
      CallExpression(node) {
        if (
          !flags.isDaoFile &&
          !flags.isDatabaseInfrastructure &&
          !flags.isTestDatabaseSetup &&
          isSqliteSqlCall(node)
        ) {
          context.report({ node, messageId: 'sql' });
        }
      },
      Literal(node) {
        reportSqliteDdl(context, node, flags, isDdlLiteral);
      },
      TemplateElement(node) {
        reportSqliteDdl(context, node, flags, isDdlLiteral);
      },
    };
  },
});

const testBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: { databaseDirectory: { type: 'string' } },
      },
    ],
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
    let flags: SqliteTestFileFlags = {
      isManagedSetup: false,
      isTestFile: false,
      isUnitTest: false,
    };
    let relativePath = '';
    let databaseDirectory = 'system/database';
    let state: SqliteTestState = { usesManagedHook: false };
    let bindings: SqliteTestBindings = { apis: new Set(), namespaces: new Set() };
    const concurrentCandidates: ESTree.MemberExpression[] = [];

    return {
      before() {
        relativePath = projectPath(context);
        databaseDirectory = configuredDatabaseDirectory(context);
        flags = {
          isManagedSetup: relativePath === testDatabaseSetupPath,
          isTestFile: testFilePattern.test(relativePath),
          isUnitTest: unitTestFilePattern.test(relativePath),
        };
        if (!flags.isManagedSetup && !flags.isTestFile) {
          return false;
        }
        state = { usesManagedHook: false };
        bindings = { apis: new Set(), namespaces: new Set() };
        concurrentCandidates.length = 0;
        return undefined;
      },
      ImportDeclaration(node) {
        inspectTestImport(context, node, {
          flags,
          state,
          bindings,
          relativePath,
          databaseDirectory,
        });
      },
      ExportAllDeclaration(node) {
        if (flags.isManagedSetup) {
          context.report({ node, messageId: 'testExport' });
        }
      },
      ExportDefaultDeclaration(node) {
        if (flags.isManagedSetup) {
          context.report({ node, messageId: 'testExport' });
        }
      },
      ExportNamedDeclaration(node) {
        if (
          flags.isManagedSetup &&
          exportedNames(node).some((name) => name !== publicTestDatabaseExportName)
        ) {
          context.report({ node, messageId: 'testExport' });
        }
      },
      MemberExpression(node) {
        if (
          !node.computed &&
          node.property.type === 'Identifier' &&
          node.property.name === 'concurrent'
        ) {
          concurrentCandidates.push(node);
        }
      },
      after() {
        if (!state.usesManagedHook) {
          return;
        }
        for (const node of concurrentCandidates) {
          if (isConcurrentTestReference(node, bindings)) {
            context.report({ node, messageId: 'concurrent' });
          }
        }
      },
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
