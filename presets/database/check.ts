import type { CheckResult, PresetCheckModule } from 'agent-quality-gate/shared/verify';
import { committedMigrationsPreflight } from 'agent-quality-gate/internal/presets/_shared/database-preflight/committed-migrations-preflight.ts';
import { databaseConcurrencyPreflight } from 'agent-quality-gate/internal/presets/_shared/database-preflight/database-concurrency-preflight.ts';

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
