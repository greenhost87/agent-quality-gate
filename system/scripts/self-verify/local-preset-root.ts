import { cp, lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { withPackageResolutionAt } from '../source-package-resolution/source-package-resolution.js';

const STAGING_PREFIX = '.aqg-linked-preset-';

export function isLinkedPresetStagingName(name: string): boolean {
  return name.startsWith(STAGING_PREFIX);
}

export async function withLocalPresetExecutionRoot<T>(
  presetsRoot: string,
  presetName: string,
  run: (presetRoot: string) => Promise<T>,
): Promise<T> {
  const presetRoot = join(presetsRoot, presetName);
  if (!(await lstat(presetRoot)).isSymbolicLink()) {
    return withPackageResolutionAt(
      presetRoot,
      dirname(presetsRoot),
      async () => await run(presetRoot),
    );
  }

  const sourceRoot = await realpath(presetRoot);
  const stagingRoot = await mkdtemp(join(dirname(sourceRoot), `${STAGING_PREFIX}${presetName}-`));
  try {
    await cp(presetRoot, stagingRoot, {
      recursive: true,
      dereference: true,
      filter: (source) => basename(source) !== 'node_modules',
    });
    return await withPackageResolutionAt(
      stagingRoot,
      dirname(presetsRoot),
      async () => await run(stagingRoot),
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
