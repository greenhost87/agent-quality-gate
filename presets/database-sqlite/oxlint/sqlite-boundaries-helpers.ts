import type { Context, ESTree } from '@oxlint/plugins';

import type { SqliteFileFlags } from './sqlite-flags.ts';

const daoFilePattern = /\.dao(?:\.[^/]+)*\.[cm]?[jt]s$/u;

export function buildSqliteFileFlags(relativePath: string): SqliteFileFlags {
  return {
    isDatabaseInfrastructure:
      relativePath === 'system/database/connection.ts' ||
      relativePath === 'system/database/migrate.ts',
    isDaoFile: daoFilePattern.test(relativePath),
    isMigrationRunner: relativePath === 'system/database/migrate.ts',
    isSystemFile: relativePath.startsWith('system/'),
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
