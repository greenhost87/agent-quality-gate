import { type Context, type ESTree } from '@oxlint/plugins';

import type { DaoScanFlags } from './dao-boundaries.ts';
import { isDaoClassName } from './dao-boundaries-shared.ts';

export function reportDaoProgramFlags(
  context: Context,
  node: ESTree.Program,
  flags: DaoScanFlags,
): void {
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

export function reportIllegalDaoConstruct(context: Context, node: ESTree.NewExpression): void {
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

export function sourceMayContainDaoViolation(source: string): boolean {
  return (
    /\b[A-Z][A-Za-z0-9]*Dao\b/u.test(source) ||
    /\b(?:CREATE|ALTER|DROP)\b/iu.test(source) ||
    /\bunsafe\b/u.test(source)
  );
}

export function requiresBroadDaoScan(
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

export function inspectDaoModuleShape(
  context: Context,
  node: ESTree.Node,
  flags: DaoScanFlags,
): void {
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
