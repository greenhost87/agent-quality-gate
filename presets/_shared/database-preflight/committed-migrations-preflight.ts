import {
  checkResultFromDiagnostics,
  failedCheckResult,
  type CheckResult,
} from 'agent-quality-gate/shared/verify';
import {
  captureCommittedMigrationDiff,
  restoreCommittedMigrations,
  verifyCommittedMigrations,
  writeCommittedMigrationDiff,
} from './verify-committed-migrations.ts';

export async function committedMigrationsPreflight(
  projectRoot: string,
): Promise<CheckResult | undefined> {
  const check = await verifyCommittedMigrations(projectRoot);
  if (!check.ok) {
    return failedCheckResult(1, `verify: ${check.error}`);
  }
  if (check.violations.length === 0) {
    return undefined;
  }

  const paths = check.violations.map((violation) => violation.path);
  const diff = await captureCommittedMigrationDiff(projectRoot, paths);
  await writeCommittedMigrationDiff(projectRoot, diff);
  const restored = await restoreCommittedMigrations(projectRoot, paths);
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
      hints: [
        {
          kind: 'document',
          id: 'database-committed-migration',
          body: `# database-committed-migration\n\nEdited migration files already present in git HEAD were restored to HEAD. Copy the intended change from .aqg/restored-migration.diff into a new migration file under migrations/. Do not re-edit the restored committed migration files.\n`,
        },
      ],
    },
  );
}
