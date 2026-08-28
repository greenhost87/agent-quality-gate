/**
 * Sync managed database/config files from `.aqg` examples to their destinations.
 *
 * Deterministic helper for the agent — do not invent copy paths manually.
 * Overwrites existing destinations in place.
 *
 * After `verify` refreshes `.aqg/<preset>/<destination>` examples, run:
 *   bun .aqg/database/scripts/sync-database-managed.ts [project-root]
 *
 * The script copies every managed `config` + `database` file from `.aqg` to
 * its project destination using the project root (argv[2] or `process.cwd()`).
 */
import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Keep in sync with `presets/database/manifest.json` + transitive `config`.
// Managed files are those with `exampleOnly !== true`.
// Guarded by `presets/database/tests/sync-database-managed.test.ts`.
const MANAGED_FILES: readonly ManagedEntry[] = [
  { preset: 'config', destination: 'system/config/environment.ts' },
  { preset: 'database', destination: 'system/database/connection.ts' },
  { preset: 'database', destination: 'system/database/migrate.ts' },
  { preset: 'database', destination: 'tests/setup/testDatabase.ts' },
  { preset: 'database', destination: 'tests/setup/testDatabase.bootstrap.ts' },
  {
    preset: 'database',
    destination: 'tests/setup/fixtures/terminate-database-connections.sql',
  },
] as const;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function syncOne(projectRoot: string, entry: ManagedEntry): Promise<'copied' | 'missing'> {
  const examplePath = join(projectRoot, '.aqg', entry.preset, entry.destination);
  const destinationPath = join(projectRoot, entry.destination);

  if (!(await fileExists(examplePath))) {
    console.warn(
      '[database sync] missing example .aqg/%s/%s — run verify first',
      entry.preset,
      entry.destination,
    );
    return 'missing';
  }

  try {
    await mkdir(dirname(destinationPath), { recursive: true });
  } catch (error) {
    console.warn(
      '[database sync] failed to create directory for %s: %s',
      entry.destination,
      error instanceof Error ? error.message : String(error),
    );
    return 'missing';
  }

  try {
    await copyFile(examplePath, destinationPath);
  } catch (error) {
    console.warn(
      '[database sync] failed to copy %s (from .aqg/%s/%s): %s',
      entry.destination,
      entry.preset,
      entry.destination,
      error instanceof Error ? error.message : String(error),
    );
    return 'missing';
  }

  console.log(
    '[database sync] copied %s (from .aqg/%s/%s)',
    entry.destination,
    entry.preset,
    entry.destination,
  );
  return 'copied';
}

async function main(): Promise<void> {
  const projectRoot = resolve(process.argv[2] ?? process.cwd());
  let copied = 0;
  let missing = 0;

  for (const entry of MANAGED_FILES) {
    const result = await syncOne(projectRoot, entry);
    if (result === 'copied') {
      copied += 1;
    } else {
      missing += 1;
    }
  }

  if (missing > 0) {
    console.warn(
      '[database sync] done: %s copied, %s missing (run verify to refresh .aqg)',
      String(copied),
      String(missing),
    );
    process.exitCode = 1;
  } else {
    console.log('[database sync] done: %s files synced', String(copied));
  }
}

if (import.meta.main) {
  await main();
}

export type ManagedEntry = {
  preset: 'config' | 'database';
  destination: string;
};
