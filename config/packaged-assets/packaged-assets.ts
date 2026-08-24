import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FALLOW_CONFIG_NAME,
  OXLINT_CONFIG_NAME,
} from '../verify-config-files/verify-config-files.js';

function assetCandidates(fromDirectory: string): string[] {
  return [
    join(fromDirectory, 'assets'),
    join(fromDirectory, '..', 'assets'),
    join(fromDirectory, '..', '..', 'assets'),
    join(fromDirectory, '..', 'extensions', 'assets'),
    join(fromDirectory, '..', '..', 'extensions', 'assets'),
    join(fromDirectory, '..', '..', '..', 'extensions', 'assets'),
    join(fromDirectory, '..', '..', 'install', 'dist', 'extensions', 'assets'),
  ];
}

function isPackagedAssetsDirectory(directory: string): boolean {
  return (
    existsSync(join(directory, OXLINT_CONFIG_NAME)) &&
    existsSync(join(directory, FALLOW_CONFIG_NAME))
  );
}

/** Resolve packaged oxlint/fallow assets for source, extensions/, or cursor/ bundles. */
export function resolvePackagedAssetsDirectory(fromDirectory: string): string {
  const candidates = assetCandidates(fromDirectory);
  for (const candidate of candidates) {
    if (isPackagedAssetsDirectory(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `verify internal error: packaged Oxlint/Fallow assets not found (looked in ${candidates.join(', ')})`,
  );
}

export function packagedAssetsDirectory(): string {
  return resolvePackagedAssetsDirectory(realpathSync(dirname(fileURLToPath(import.meta.url))));
}

export function packagedOxlintConfigPath(): string {
  return join(packagedAssetsDirectory(), OXLINT_CONFIG_NAME);
}

export function packagedFallowConfigPath(): string {
  return join(packagedAssetsDirectory(), FALLOW_CONFIG_NAME);
}

export function packagedGlobalConfigTemplatePath(): string {
  return join(packagedAssetsDirectory(), 'global-config.yaml');
}
