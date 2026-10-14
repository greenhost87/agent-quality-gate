import type { Context, ESTree } from '@oxlint/plugins';
import { posix } from 'node:path';

import type { SqliteFileFlags } from './sqlite-flags.ts';

const daoFilePattern = /\.dao(?:\.[^/]+)*\.[cm]?[jt]s$/u;
const sqlStatementPattern =
  /^\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|WITH|PRAGMA|EXPLAIN|ANALYZE|VACUUM|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)\b/iu;
const sqliteSqlMethodNames = new Set(['exec', 'prepare', 'query', 'run']);

function sqliteSqlMethodName(node: ESTree.CallExpression): string | null {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') {
    return null;
  }
  if (!callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return callee.computed && callee.property.type === 'Literal'
    ? String(callee.property.value)
    : null;
}

function startsWithSqlStatement(node: ESTree.Node): boolean {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return sqlStatementPattern.test(node.value);
  }
  return node.type === 'TemplateLiteral' && sqlStatementPattern.test(node.quasis[0].value.raw);
}

export function isSqliteSqlCall(node: ESTree.CallExpression): boolean {
  const methodName = sqliteSqlMethodName(node);
  const firstArgument = node.arguments.at(0);
  return (
    methodName !== null &&
    sqliteSqlMethodNames.has(methodName) &&
    firstArgument !== undefined &&
    firstArgument.type !== 'SpreadElement' &&
    startsWithSqlStatement(firstArgument)
  );
}

export function buildSqliteFileFlags(
  relativePath: string,
  databaseDirectory = 'system/database',
): SqliteFileFlags {
  const infrastructureRoot = posix.dirname(databaseDirectory);
  return {
    isDatabaseInfrastructure:
      relativePath === `${databaseDirectory}/connection.ts` ||
      relativePath === `${databaseDirectory}/migrate.ts`,
    isDaoFile: daoFilePattern.test(relativePath),
    isMigrationRunner: relativePath === `${databaseDirectory}/migrate.ts`,
    isSystemFile: infrastructureRoot !== '.' && relativePath.startsWith(`${infrastructureRoot}/`),
    isTestDatabaseSetup: relativePath === 'tests/setup/testDatabase.ts',
  };
}

export function reportSqliteDdl(
  context: Context,
  node: ESTree.Node,
  flags: SqliteFileFlags,
  isDdlLiteral: (node: ESTree.Node) => boolean,
): void {
  if (!flags.isMigrationRunner && !flags.isTestDatabaseSetup && isDdlLiteral(node)) {
    context.report({ node, messageId: 'ddl' });
  }
}
