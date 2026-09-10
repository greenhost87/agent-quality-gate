import {
  checkResultFromDiagnostics,
  failedCheckResult,
  type CheckResult,
} from '../../gate/execute-verify/check-result.ts';
import {
  captureCommittedMigrationDiff,
  restoreCommittedMigrations,
  verifyCommittedMigrations,
  writeCommittedMigrationDiff,
} from './verify-committed-migrations.ts';

export async function committedMigrationsPreflight(
  projectRoot: string,
): Promise<CheckResult | undefined> {
  const check = verifyCommittedMigrations(projectRoot);
  if (!check.ok) {
    return failedCheckResult(1, `verify: ${check.error}`);
  }
  if (check.violations.length === 0) {
    return undefined;
  }

  const paths = check.violations.map((violation) => violation.path);
  await writeCommittedMigrationDiff(projectRoot, captureCommittedMigrationDiff(projectRoot, paths));
  const restored = restoreCommittedMigrations(projectRoot, paths);
  const lead = restored.ok
    ? 'verify: restored committed migration files'
    : 'verify: committed migration files must not be changed';
  return checkResultFromDiagnostics(
    [
      {
        source: 'database',
        ruleId: 'database-committed-migration',
        severity: 'error',
        message: lead,
      },
    ],
    {
      hints: [{ kind: 'builtin', id: 'database-committed-migration' }],
    },
  );
}
