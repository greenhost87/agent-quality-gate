import { lstat, mkdir, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../../..');

/** Add a temporary package link where a tool resolves its dependencies. */
export async function withPackageResolutionAt<T>(
  packageRoot: string,
  sourcePackageRoot: string,
  run: () => Promise<T>,
): Promise<T> {
  const packageLink = join(packageRoot, 'node_modules', 'agent-quality-gate');
  let createdPackageLink = false;
  try {
    await lstat(packageLink);
  } catch {
    await mkdir(dirname(packageLink), { recursive: true });
    await symlink(sourcePackageRoot, packageLink, 'dir');
    createdPackageLink = true;
  }

  try {
    return await run();
  } finally {
    if (createdPackageLink) await rm(packageLink, { force: true });
  }
}

/** Expose the checkout package to tools launched from nested source and preset roots. */
export async function withSourcePackageResolution<T>(run: () => Promise<T>): Promise<T> {
  return withPackageResolutionAt(PROJECT_ROOT, PROJECT_ROOT, run);
}
