import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chdir } from 'node:process';
import { pathToFileURL } from 'node:url';
import { SQL, file } from 'bun';
import { getRequiredEnv, setEnv } from '@/system/config/environment';
import { useIsolatedTestDatabase } from '../payload/tests/setup/testDatabase.ts';

const presetRoot = resolve(import.meta.dir, '..');
chdir(presetRoot);

const connectionSourcePath = resolve(presetRoot, 'payload/system/database/connection.ts');
const environmentModuleUrl = pathToFileURL(
  resolve(presetRoot, '../config/payload/system/config/environment.ts'),
).href;

type ConnectionModule = {
  sql: SQL;
  getDatabaseGeneration: () => number;
  closeDatabase: () => Promise<void>;
};

const loadedModules: ConnectionModule[] = [];
const temporaryDirectories: string[] = [];

useIsolatedTestDatabase(import.meta.path);

afterEach(async () => {
  try {
    while (loadedModules.length > 0) {
      const connectionModule = loadedModules.pop();
      if (connectionModule) {
        await connectionModule.closeDatabase();
      }
    }
  } finally {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map(async (directory) => await rm(directory, { recursive: true, force: true })),
    );
  }
});

async function loadConnectionModuleInstance(tag: string): Promise<ConnectionModule> {
  await mkdir(join(presetRoot, 'tmp'), { recursive: true });
  const directory = await mkdtemp(join(presetRoot, 'tmp', `aqg-database-connection-${tag}-`));
  temporaryDirectories.push(directory);
  const connectionDestination = join(directory, 'connection.ts');
  const connectionSource = await file(connectionSourcePath).text();

  await writeFile(
    connectionDestination,
    connectionSource.replaceAll(
      `from '@/system/config/environment'`,
      `from '${environmentModuleUrl}'`,
    ),
  );

  const connectionModule = (await import(
    pathToFileURL(connectionDestination).href
  )) as ConnectionModule;
  loadedModules.push(connectionModule);
  return connectionModule;
}

function maintenanceDatabaseUrl(applicationUrl: string): string {
  const url = new URL(applicationUrl);
  url.pathname = '/postgres';
  return url.toString();
}

describe('database connection module reload', () => {
  test('reuses one SQL client across distinct connection module instances', async () => {
    const first = await loadConnectionModuleInstance('first');
    const second = await loadConnectionModuleInstance('second');

    expect(first.getDatabaseGeneration()).toBe(second.getDatabaseGeneration());
    expect(await first.sql<{ value: number }[]>`SELECT 1 AS value`).toEqual([{ value: 1 }]);
    expect(await second.sql<{ value: number }[]>`SELECT 1 AS value`).toEqual([{ value: 1 }]);
  });

  test('closeDatabase clears shared state so only one close owns the client', async () => {
    const first = await loadConnectionModuleInstance('close-a');
    const second = await loadConnectionModuleInstance('close-b');
    const sharedGeneration = first.getDatabaseGeneration();
    expect(second.getDatabaseGeneration()).toBe(sharedGeneration);

    await first.closeDatabase();
    await second.closeDatabase();

    expect(second.getDatabaseGeneration()).toBeGreaterThan(sharedGeneration);
    expect(await second.sql<{ value: number }[]>`SELECT 1 AS value`).toEqual([{ value: 1 }]);
  });

  test('does not reuse a client created for a different DATABASE_URL', async () => {
    const connectionModule = await loadConnectionModuleInstance('url-switch');
    const applicationUrl = getRequiredEnv('DATABASE_URL');
    const otherUrl = maintenanceDatabaseUrl(applicationUrl);

    const applicationGeneration = connectionModule.getDatabaseGeneration();
    expect(
      await connectionModule.sql<{ name: string }[]>`SELECT current_database() AS name`,
    ).toEqual([{ name: new URL(applicationUrl).pathname.slice(1) }]);

    setEnv('DATABASE_URL', otherUrl);

    expect(connectionModule.getDatabaseGeneration()).toBeGreaterThan(applicationGeneration);
    expect(
      await connectionModule.sql<{ name: string }[]>`SELECT current_database() AS name`,
    ).toEqual([{ name: 'postgres' }]);
  });
});
