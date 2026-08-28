import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { SHIPPED_PRESET_NAMES } from '../../preset-catalog/catalog/preset-catalog.js';
import { installPresetFromSource } from '../install-preset/install-preset.js';

const SHIPPED_PRESET_NAME_SET = new Set<string>(SHIPPED_PRESET_NAMES);

/** Optional preset source roots under a `presets/` directory (shipped names excluded). */
export function optionalPresetSourceRoots(presetsDirectory: string): string[] {
  if (!existsSync(presetsDirectory)) {
    return [];
  }
  const roots: string[] = [];
  for (const entry of readdirSync(presetsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (SHIPPED_PRESET_NAME_SET.has(entry.name)) {
      continue;
    }
    const sourceRoot = join(presetsDirectory, entry.name);
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
