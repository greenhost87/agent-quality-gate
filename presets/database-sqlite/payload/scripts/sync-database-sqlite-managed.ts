/**
 * Sync managed config/database-sqlite files from `.aqg` to project destinations.
 * Run after verify: bun .aqg/database-sqlite/scripts/sync-database-sqlite-managed.ts [project-root]
 */
import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const MANAGED_FILES: readonly ManagedEntry[] = [
  { preset: 'config', destination: 'system/config/environment.ts' },
  { preset: 'database-sqlite', destination: 'system/database/connection.ts' },
  { preset: 'database-sqlite', destination: 'system/database/migrate.ts' },
  { preset: 'database-sqlite', destination: 'tests/setup/testDatabase.ts' },
] as const;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function syncOne(projectRoot: string, entry: ManagedEntry): Promise<boolean> {
  const sourcePath = join(projectRoot, '.aqg', entry.preset, entry.destination);
  const destinationPath = join(projectRoot, entry.destination);
  if (!(await fileExists(sourcePath))) {
    console.warn(
      '[database-sqlite sync] missing .aqg/%s/%s — run verify first',
      entry.preset,
      entry.destination,
    );
    return false;
  }

  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  console.log(
    '[database-sqlite sync] copied %s (from .aqg/%s/%s)',
    entry.destination,
    entry.preset,
    entry.destination,
  );
  return true;
}

async function main(): Promise<void> {
  const projectRoot = resolve(process.argv[2] ?? process.cwd());
  let failures = 0;
  for (const entry of MANAGED_FILES) {
    if (!(await syncOne(projectRoot, entry))) {
      failures += 1;
    }
  }
  if (failures > 0) {
    console.warn('[database-sqlite sync] failed to sync %s managed files', String(failures));
    process.exitCode = 1;
  } else {
    console.log('[database-sqlite sync] managed files synced');
  }
}

if (import.meta.main) {
  await main();
}

export type ManagedEntry = {
  preset: 'config' | 'database-sqlite';
  destination: string;
};
