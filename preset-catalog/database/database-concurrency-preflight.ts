import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.ts';
import {
  formatDatabaseConcurrencyViolations,
  verifyDatabaseConcurrencyScripts,
} from './verify-database-concurrency.ts';

export async function databaseConcurrencyPreflight(
  projectRoot: string,
): Promise<ToolRunResult | undefined> {
  const violations = await verifyDatabaseConcurrencyScripts(projectRoot);
  if (violations.length === 0) {
    return undefined;
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: `verify: database concurrent test scripts are not allowed\n${formatDatabaseConcurrencyViolations(violations)}\n`,
  };
}
