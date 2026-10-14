import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach } from 'bun:test';

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

/**
 * Module-level temp-directory tracking for tests: registers `afterEach`
 * cleanup and hands out a bound `makeTempDirectory`, so test files no
 * longer inline the array + maker + cleanup trio. Call at module scope,
 * like `useIsolatedAgentQualityGateHome()`.
 */
export function useTrackedTempDirectories(): {
  tempDirectories: string[];
  makeTempDirectory: (prefix: string) => Promise<string>;
} {
  const tempDirectories: string[] = [];
  afterEach(async () => {
    await removeTrackedTempDirectories(tempDirectories);
  });
  return {
    tempDirectories,
    makeTempDirectory: async (prefix: string) => makeTrackedTempDirectory(tempDirectories, prefix),
  };
}
