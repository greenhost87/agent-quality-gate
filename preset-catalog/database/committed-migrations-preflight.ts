import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.ts';
import {
  captureCommittedMigrationDiff,
  restoreCommittedMigrations,
  verifyCommittedMigrations,
  writeCommittedMigrationDiff,
} from './verify-committed-migrations.ts';

export async function committedMigrationsPreflight(
  projectRoot: string,
): Promise<ToolRunResult | undefined> {
  const check = verifyCommittedMigrations(projectRoot);
  if (!check.ok) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `verify: ${check.error}\n`,
    };
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
  return {
    exitCode: 1,
    stdout: '',
    stderr: `${lead}\ndatabase-committed-migration\n`,
  };
}
