import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import {
  bunTestApiNames,
  createsPostgreSqlContainer,
  e2eDirectoryPattern,
  exportNames,
  genericTestDatabaseInterfaceNames,
  importSource,
  importSpecifierName,
  isIdentifierReference,
  isInsideCallbackOf,
  isTestDatabaseInfrastructureImport,
  isTypeOnlyImport,
  isTypeOnlySpecifier,
  managedTestDatabaseBootstrapPath,
  managedTestDatabasePath,
  productionDaoBindingImportPattern,
  projectPath,
  publicTestDatabaseExportNames,
  testDatabaseImportPattern,
  testsDirectoryPattern,
  unitTestsDirectoryPattern,
} from './dao-boundaries-shared.ts';
import type {
  TestDatabaseBindings,
  TestDatabaseImportOptions,
  TestDatabaseScanState,
  TestDatabaseState,
} from './test-database-boundaries.types.ts';
import { walkAst } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

function recordBunTestBindings(
  node: ESTree.ImportDeclaration,
  bunTestBindings: Set<string>,
  bunTestNamespaces: Set<string>,
  beforeAllBindings: Set<string>,
): void {
  for (const specifier of node.specifiers) {
    if (isTypeOnlySpecifier(specifier)) continue;
    if (specifier.type === 'ImportNamespaceSpecifier') {
      bunTestNamespaces.add(specifier.local.name);
      continue;
    }
    if (specifier.type !== 'ImportSpecifier') {
      continue;
    }
    const imported = importSpecifierName(specifier);
    if (imported && bunTestApiNames.has(imported)) {
      bunTestBindings.add(specifier.local.name);
    }
    if (imported === 'beforeAll') {
      beforeAllBindings.add(specifier.local.name);
    }
  }
}

function reportTestDatabaseImport(
  context: Context,
  node: ESTree.ImportDeclaration,
  source: string,
  isUnitTest: boolean,
  state: TestDatabaseState,
): void {
  if (
    node.specifiers.some((specifier) => {
      const imported = importSpecifierName(specifier);
      const local = specifier.local.name;
      return (
        (imported !== null && genericTestDatabaseInterfaceNames.has(imported)) ||
        genericTestDatabaseInterfaceNames.has(local)
      );
    })
  ) {
    context.report({ node: node.source, messageId: 'generic' });
  }
  const hasDisallowedImport = node.specifiers.some((specifier) => {
    if (specifier.type === 'ImportNamespaceSpecifier') return true;
    if (specifier.type === 'ImportDefaultSpecifier') return true;
    const imported = importSpecifierName(specifier);
    return imported !== 'useIsolatedTestDatabase';
  });
  if (hasDisallowedImport) {
    context.report({ node: node.source, messageId: 'import' });
  }
  if (
    !isTypeOnlyImport(node) &&
    node.specifiers.some(
      (specifier) =>
        !isTypeOnlySpecifier(specifier) &&
        importSpecifierName(specifier) === 'useIsolatedTestDatabase',
    )
  ) {
    state.usesManagedHook = true;
  }
  if (isUnitTest) {
    context.report({ node: node.source, messageId: 'unitImport' });
  }
}

function reportProductionDaoBindings(
  node: ESTree.ImportDeclaration,
  productionDaoBindings: Set<string>,
): void {
  if (isTypeOnlyImport(node)) {
    return;
  }
  const source = importSource(node);
  if (
    source === null ||
    !productionDaoBindingImportPattern.test(source) ||
    source.includes('.dao.types')
  ) {
    return;
  }
  for (const specifier of node.specifiers) {
    if (isTypeOnlySpecifier(specifier)) continue;
    productionDaoBindings.add(specifier.local.name);
  }
}

function handleTestDatabaseImportDeclaration(
  context: Context,
  node: ESTree.ImportDeclaration,
  options: TestDatabaseImportOptions,
): void {
  const source = importSource(node);
  if (!source) return;

  const {
    isTestOrE2eFile,
    isTestDatabaseSetup,
    isUnitTest,
    bunTestBindings,
    bunTestNamespaces,
    beforeAllBindings,
    productionDaoBindings,
    state,
  } = options;

  if (isTestOrE2eFile && source === 'bun:test' && !isTypeOnlyImport(node)) {
    recordBunTestBindings(node, bunTestBindings, bunTestNamespaces, beforeAllBindings);
  }

  if (isTestOrE2eFile && testDatabaseImportPattern.test(source)) {
    reportTestDatabaseImport(context, node, source, isUnitTest, state);
  }

  if (isTestOrE2eFile && !isTestDatabaseSetup && isTestDatabaseInfrastructureImport(node, source)) {
    context.report({ node: node.source, messageId: 'infrastructure' });
  }

  if (isTestOrE2eFile) {
    reportProductionDaoBindings(node, productionDaoBindings);
  }
}

function matchesNamespaceMember(
  node: ESTree.Node,
  namespaces: Set<string>,
  propertyMatches: (name: string) => boolean,
): node is ESTree.MemberExpression {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    namespaces.has(node.object.name) &&
    node.property.type === 'Identifier' &&
    propertyMatches(node.property.name)
  );
}

function reportSetupExports(
  context: Context,
  node: ESTree.Node,
  isTestDatabaseSetup: boolean,
): void {
  if (isTestDatabaseSetup) {
    context.report({ node, messageId: 'export' });
  }
}

function reportNamedSetupExports(
  context: Context,
  node: ESTree.ExportNamedDeclaration,
  relativePath: string,
): void {
  const names = exportNames(node);
  if (names.some((name) => genericTestDatabaseInterfaceNames.has(name))) {
    context.report({ node, messageId: 'generic' });
  }
  if (
    relativePath === managedTestDatabasePath &&
    names.some((name) => !publicTestDatabaseExportNames.has(name))
  ) {
    context.report({ node, messageId: 'export' });
  }
}

function reportGenericName(context: Context, node: ESTree.Node, name: string | null): void {
  if (name != null && genericTestDatabaseInterfaceNames.has(name)) {
    context.report({ node, messageId: 'generic' });
  }
}

function reportForbiddenContainer(
  context: Context,
  node: ESTree.Node,
  isTestOrE2eFile: boolean,
  isTestDatabaseSetup: boolean,
): void {
  if (isTestOrE2eFile && !isTestDatabaseSetup && createsPostgreSqlContainer(node)) {
    context.report({ node, messageId: 'container' });
  }
}

function isBunTestApiReference(node: ESTree.Node, bindings: TestDatabaseBindings): boolean {
  if (node.type === 'Identifier') {
    return bindings.bunTestBindings.has(node.name);
  }
  return matchesNamespaceMember(node, bindings.bunTestNamespaces, (name) =>
    bunTestApiNames.has(name),
  );
}

function isBeforeAllCallee(
  callee: ESTree.Expression | ESTree.Super,
  bindings: TestDatabaseBindings,
): boolean {
  if (callee.type === 'Identifier') {
    return bindings.beforeAllBindings.has(callee.name);
  }
  return matchesNamespaceMember(callee, bindings.bunTestNamespaces, (name) => name === 'beforeAll');
}

function reportBeforeAllDaoUses(context: Context, scanState: TestDatabaseScanState): void {
  const { bindings, deferred } = scanState;
  for (const node of deferred.identifierReferences) {
    if (node.type !== 'Identifier') continue;
    if (!bindings.productionDaoBindings.has(node.name)) continue;
    if (!isIdentifierReference(node)) continue;
    if (!isInsideCallbackOf(node, (callee) => isBeforeAllCallee(callee, bindings))) continue;
    context.report({ node, messageId: 'beforeAllDao' });
  }
}

function reportConcurrentUses(context: Context, scanState: TestDatabaseScanState): void {
  const { bindings, deferred } = scanState;
  for (const node of deferred.concurrentReferences) {
    if (node.type !== 'MemberExpression' || node.property.type !== 'Identifier') continue;
    if (!isBunTestApiReference(node.object, bindings)) continue;
    context.report({ node: node.property, messageId: 'concurrent' });
  }
}

function inspectTestDatabaseNode(
  context: Context,
  node: ESTree.Node,
  scanState: TestDatabaseScanState,
  relativePath: string,
): void {
  const { flags, bindings, state, deferred } = scanState;
  switch (node.type) {
    case 'ExportAllDeclaration':
    case 'ExportDefaultDeclaration':
      reportSetupExports(context, node, relativePath === managedTestDatabasePath);
      break;
    case 'ExportNamedDeclaration':
      if (flags.isTestDatabaseSetup) {
        reportNamedSetupExports(context, node, relativePath);
      }
      break;
    case 'FunctionDeclaration':
      if (flags.isTestOrE2eFile) {
        reportGenericName(context, node, node.id?.name ?? null);
      }
      break;
    case 'Identifier':
      deferred.identifierReferences.push(node);
      break;
    case 'ImportDeclaration':
      handleTestDatabaseImportDeclaration(context, node, {
        isTestOrE2eFile: flags.isTestOrE2eFile,
        isTestDatabaseSetup: flags.isTestDatabaseSetup,
        isUnitTest: flags.isUnitTest,
        bunTestBindings: bindings.bunTestBindings,
        bunTestNamespaces: bindings.bunTestNamespaces,
        beforeAllBindings: bindings.beforeAllBindings,
        productionDaoBindings: bindings.productionDaoBindings,
        state,
      });
      break;
    case 'MemberExpression':
      if (
        !node.computed &&
        node.property.type === 'Identifier' &&
        node.property.name === 'concurrent'
      ) {
        deferred.concurrentReferences.push(node);
      }
      break;
    case 'NewExpression':
      reportForbiddenContainer(context, node, flags.isTestOrE2eFile, flags.isTestDatabaseSetup);
      break;
    case 'VariableDeclarator':
      if (flags.isTestOrE2eFile && node.id.type === 'Identifier') {
        reportGenericName(context, node, node.id.name);
      }
      break;
    default:
      break;
  }
}

export const testDatabaseBoundaries = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      beforeAllDao:
        'Do not use production DAO bindings from beforeAll when useIsolatedTestDatabase is active; arrange in beforeEach or the test body.',
      concurrent: 'Concurrent Bun tests are not allowed in files that use useIsolatedTestDatabase.',
      container:
        'Only tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts may create a PostgreSQL container.',
      export: 'testDatabase.ts may export only useIsolatedTestDatabase.',
      generic: 'Generic test database query interfaces are not allowed.',
      import: 'Import only useIsolatedTestDatabase from tests/setup/testDatabase.ts.',
      infrastructure:
        'Test database infrastructure is available only from tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
      unitImport: 'Unit tests must not import tests/setup/testDatabase.ts.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const relativePath = projectPath(context);
        const scanState: TestDatabaseScanState = {
          flags: {
            isTestOrE2eFile:
              testsDirectoryPattern.test(relativePath) || e2eDirectoryPattern.test(relativePath),
            isTestDatabaseSetup:
              relativePath === managedTestDatabasePath ||
              relativePath === managedTestDatabaseBootstrapPath,
            isUnitTest: unitTestsDirectoryPattern.test(relativePath),
          },
          bindings: {
            productionDaoBindings: new Set(),
            bunTestBindings: new Set(),
            bunTestNamespaces: new Set(),
            beforeAllBindings: new Set(),
          },
          state: { usesManagedHook: false },
          deferred: {
            identifierReferences: [],
            concurrentReferences: [],
          },
        };

        walkAst(context.sourceCode.ast, (node, parent) => {
          node.parent = parent;
          inspectTestDatabaseNode(context, node, scanState, relativePath);
        });
        if (scanState.state.usesManagedHook) {
          reportBeforeAllDaoUses(context, scanState);
          reportConcurrentUses(context, scanState);
        }
        return false;
      },
      Program() {},
    };
  },
});
