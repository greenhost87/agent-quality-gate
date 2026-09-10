import type { CheckResult } from '../../gate/execute-verify/check-result.ts';
import type { PresetCheckModule } from '../../preset-catalog/contract/preset-check.types.ts';
import { committedMigrationsPreflight } from '../../preset-catalog/database/committed-migrations-preflight.ts';
import { databaseConcurrencyPreflight } from '../../preset-catalog/database/database-concurrency-preflight.ts';

async function databasePreflight(projectRoot: string): Promise<CheckResult | undefined> {
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
