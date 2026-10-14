import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FALLOW_CONFIG_NAME,
  OXLINT_CONFIG_NAME,
} from '../verify-config-files/verify-config-files.js';

function isPackagedAssetsDirectory(directory: string): boolean {
  return (
    existsSync(join(directory, OXLINT_CONFIG_NAME)) &&
    existsSync(join(directory, FALLOW_CONFIG_NAME))
  );
}

/** Resolve packaged Oxlint/Fallow assets from the consumer's adjacent configs directory. */
export function resolvePackagedAssetsDirectory(fromDirectory: string): string {
  const configsDirectory = join(fromDirectory, 'configs');
  if (isPackagedAssetsDirectory(configsDirectory)) {
    return configsDirectory;
  }
  throw new Error(
    `verify internal error: packaged Oxlint/Fallow assets not found in ${configsDirectory}`,
  );
}

export function packagedAssetsDirectory(): string {
  const moduleDirectory = realpathSync(dirname(fileURLToPath(import.meta.url)));
  const adjacentConfigs = join(moduleDirectory, 'configs');
  if (isPackagedAssetsDirectory(adjacentConfigs)) {
    return adjacentConfigs;
  }
  // In the source tree, shared config assets live at system/configs.
  return resolvePackagedAssetsDirectory(join(moduleDirectory, '..', '..'));
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
