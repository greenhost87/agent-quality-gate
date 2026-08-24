// Managed by agent-quality-gate. Do not edit; changes are overwritten on verify.

/**
 * Point playwright.config.ts webServer.command at a project-owned scripts/ starter
 * (not this file, and not under tests/ or e2e/). That command starts PostgreSqlContainer,
 * setEnv('DATABASE_URL', container.getConnectionUri()), runDatabaseMigrations(),
 * then the app, and waits until baseURL responds. Use the container URI; Bun.sql stays
 * in system/database and tests/setup/testDatabase.ts. Playwright shares one database
 * for the run (workers: 1, unique UI names). Bun tests keep useIsolatedTestDatabase.
 */
export {};
