import type { PresetCheckModule } from 'agent-quality-gate/shared/verify';
import { committedMigrationsPreflight } from 'agent-quality-gate/internal/presets/_shared/database-preflight/committed-migrations-preflight.ts';
import { databaseConcurrencyPreflight } from 'agent-quality-gate/internal/presets/_shared/database-preflight/database-concurrency-preflight.ts';

const checkModule: PresetCheckModule = {
  preflight: async (projectRoot) =>
    (await databaseConcurrencyPreflight(projectRoot)) ??
    (await committedMigrationsPreflight(projectRoot)),
};

export const preflight = checkModule.preflight;
export const runToolChecks = checkModule.runToolChecks;
