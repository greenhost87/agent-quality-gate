import {
  checkResultFromDiagnostics,
  type CheckResult,
} from '../../gate/execute-verify/check-result.ts';
import {
  formatDatabaseConcurrencyViolations,
  verifyDatabaseConcurrencyScripts,
} from './verify-database-concurrency.ts';

export async function databaseConcurrencyPreflight(
  projectRoot: string,
): Promise<CheckResult | undefined> {
  const violations = await verifyDatabaseConcurrencyScripts(projectRoot);
  if (violations.length === 0) {
    return undefined;
  }
  return checkResultFromDiagnostics(
    [
      {
        source: 'database',
        ruleId: 'database-concurrent-script',
        severity: 'error',
        message: `database concurrent test scripts are not allowed\n${formatDatabaseConcurrencyViolations(violations)}`,
      },
    ],
    {
      hints: [{ kind: 'builtin', id: 'database-boundary' }],
    },
  );
}
