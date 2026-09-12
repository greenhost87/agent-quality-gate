import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function makeTrackedTempDirectory(
  tempDirectories: string[],
  prefix: string,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

export function takeTrackedTempDirectories(tempDirectories: string[]): string[] {
  return tempDirectories.splice(0);
}

export async function removeTrackedTempDirectories(tempDirectories: string[]): Promise<void> {
  await Promise.all(
    takeTrackedTempDirectories(tempDirectories).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
}
