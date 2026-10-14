/**
 * Sync managed config/database-sqlite files from `.aqg` to project destinations.
 * Run after verify: bun .aqg/database-sqlite/scripts/sync-database-sqlite-managed.ts [project-root]
 */
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

const MANAGED_FILES: readonly ManagedEntry[] = [
  { preset: 'config', destination: 'system/config/environment.ts' },
  { preset: 'database-sqlite', destination: 'system/database/connection.ts' },
  { preset: 'database-sqlite', destination: 'system/database/migrate.ts' },
  { preset: 'database-sqlite', destination: 'tests/setup/testDatabase.ts' },
] as const;

async function findRelocatedDestination(
  projectRoot: string,
  entry: ManagedEntry,
): Promise<string | undefined> {
  const presetRoot = join(projectRoot, '.aqg', entry.preset);
  const expectedBasename = basename(entry.destination);
  const matches: string[] = [];
  const pending = [presetRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) pending.push(path);
      else if (item.isFile() && item.name === expectedBasename) matches.push(path);
    }
  }
  const destinations = matches.map((path) => relative(presetRoot, path));
  const relocated = destinations.filter((destination) => destination !== entry.destination);
  if (relocated.length === 1) return relocated[0];
  return relocated.length === 0 && destinations.includes(entry.destination)
    ? entry.destination
    : undefined;
}

async function syncOne(projectRoot: string, entry: ManagedEntry): Promise<boolean> {
  const destination = await findRelocatedDestination(projectRoot, entry);
  if (destination === undefined) {
    console.warn(
      '[database-sqlite sync] missing .aqg/%s/%s — run verify first',
      entry.preset,
      entry.destination,
    );
    return false;
  }

  const sourcePath = join(projectRoot, '.aqg', entry.preset, destination);
  const destinationPath = join(projectRoot, destination);
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  console.log(
    '[database-sqlite sync] copied %s (from .aqg/%s/%s)',
    destination,
    entry.preset,
    destination,
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
