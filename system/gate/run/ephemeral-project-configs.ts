import { readdir, rmdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function ignoreFilesystemCodes(
  run: () => Promise<void>,
  ignoredCodes: readonly string[],
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      ignoredCodes.includes(error.code)
    ) {
      return;
    }
    throw error;
  }
}

async function removeEphemeralProjectDirectory(
  projectRoot: string,
  name: 'fallow' | 'oxlint',
): Promise<void> {
  const directory = join(resolve(projectRoot), '.aqg', name);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code === 'ENOENT'
    ) {
      return;
    }
    throw error;
  }
  await Promise.all(
    entries.map(async (entry) => {
      await ignoreFilesystemCodes(async () => {
        await unlink(join(directory, entry));
      }, ['ENOENT']);
    }),
  );
  await ignoreFilesystemCodes(async () => {
    await rmdir(directory);
  }, ['ENOENT', 'ENOTEMPTY']);
}

/** Remove verify Oxlint/Fallow configs and preset scratch files; drop empty `.aqg/oxlint` and `.aqg/fallow`. */
export async function removeEphemeralProjectConfigs(
  projectRoot: string,
  paths: EphemeralProjectConfigPaths,
): Promise<void> {
  const configPaths = [paths.oxlintConfigPath, ...paths.fallowConfigPaths].filter(
    (path): path is string => path !== undefined,
  );
  await Promise.all(
    configPaths.map(async (configPath) => {
      await ignoreFilesystemCodes(async () => {
        await unlink(configPath);
      }, ['ENOENT']);
    }),
  );
  await Promise.all([
    removeEphemeralProjectDirectory(projectRoot, 'fallow'),
    removeEphemeralProjectDirectory(projectRoot, 'oxlint'),
  ]);
}

export type EphemeralProjectConfigPaths = {
  oxlintConfigPath?: string;
  fallowConfigPaths: string[];
};
