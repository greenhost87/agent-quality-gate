import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { agentQualityGateHome } from '#system/config/agent-quality-gate-home.js';
import { SHIPPED_PRESET_NAMES } from '#system/presets/preset-catalog.js';
import { installPresetFromSource } from '../install-preset/install-preset.js';

const SHIPPED_PRESET_NAME_SET = new Set<string>(SHIPPED_PRESET_NAMES);

/** Optional preset source roots under a `presets/` directory (shipped names excluded). */
export function optionalPresetSourceRoots(presetsDirectory: string): string[] {
  if (!existsSync(presetsDirectory)) {
    return [];
  }
  const roots: string[] = [];
  for (const entry of readdirSync(presetsDirectory, { withFileTypes: true })) {
    const sourceRoot = join(presetsDirectory, entry.name);
    if (
      !entry.isDirectory() &&
      !(entry.isSymbolicLink() && existsSync(sourceRoot) && statSync(sourceRoot).isDirectory())
    ) {
      continue;
    }
    if (SHIPPED_PRESET_NAME_SET.has(entry.name)) {
      continue;
    }
    if (existsSync(join(sourceRoot, 'manifest.json'))) {
      roots.push(sourceRoot);
    }
  }
  return roots.sort((left, right) => left.localeCompare(right));
}

export async function installOptionalPresetsFromDirectory(
  presetsDirectory: string,
  home = agentQualityGateHome(),
): Promise<string[]> {
  const destinations: string[] = [];
  for (const sourceRoot of optionalPresetSourceRoots(presetsDirectory)) {
    destinations.push(await installPresetFromSource(sourceRoot, home));
  }
  return destinations;
}
