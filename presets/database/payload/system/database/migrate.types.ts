// Managed by agent-quality-gate. Do not edit; changes are overwritten on verify.

export const migrationLedgers = ['pgmigrations', 'schema_migrations'] as const;

export type MigrationLedger = (typeof migrationLedgers)[number];
