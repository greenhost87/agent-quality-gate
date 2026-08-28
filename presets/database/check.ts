import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.ts';
import type { PresetCheckModule } from '../../preset-catalog/contract/preset-check.types.ts';
import {
  captureCommittedMigrationDiff,
  restoreCommittedMigrations,
  verifyCommittedMigrations,
  writeCommittedMigrationDiff,
} from './verify-committed-migrations.ts';
import {
  formatDatabaseConcurrencyViolations,
  verifyDatabaseConcurrencyScripts,
} from './verify-database-concurrency.ts';

async function databaseConcurrencyPreflight(
  projectRoot: string,
): Promise<ToolRunResult | undefined> {
  const concurrencyViolations = await verifyDatabaseConcurrencyScripts(projectRoot);
  if (concurrencyViolations.length === 0) {
    return undefined;
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: `verify: database concurrent test scripts are not allowed\n${formatDatabaseConcurrencyViolations(concurrencyViolations)}\n`,
  };
}

async function committedMigrationsPreflight(
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

async function databasePreflight(projectRoot: string): Promise<ToolRunResult | undefined> {
  return (
    (await databaseConcurrencyPreflight(projectRoot)) ??
    (await committedMigrationsPreflight(projectRoot))
  );
}

const checkModule: PresetCheckModule = {
  preflight: databasePreflight,
};

export const preflight = checkModule.preflight;
export const runToolChecks = checkModule.runToolChecks;
