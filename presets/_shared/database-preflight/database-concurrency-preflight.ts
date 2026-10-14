import { checkResultFromDiagnostics, type CheckResult } from 'agent-quality-gate/shared/verify';
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
      hints: [
        {
          kind: 'document',
          id: 'database-boundary',
          body: `# database-boundary\n\nUse an already production-reachable module for Arrange and observation. Do not create or expand a DAO solely for a test. Keep query-result handling in the DAO and define empty-list semantics before dynamic SQL.\n`,
        },
      ],
    },
  );
}
