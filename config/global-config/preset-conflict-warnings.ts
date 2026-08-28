import type { GlobalProject } from './global-config.ts';
import * as v from 'valibot';

const PLAYWRIGHT_CONFIG = 'playwright.config.ts';
const NEXT_CONFIG = 'next.config.ts';

function packagesAllowedRootModules(presetConfig: Readonly<Record<string, object>>): string[] {
  const packages = presetConfig.packages;
  if (packages === undefined || !('allowedRootModules' in packages)) {
    return [];
  }
  const raw = packages.allowedRootModules;
  const parsed = v.safeParse(v.array(v.unknown()), raw);
  if (!parsed.success) {
    return [];
  }
  return parsed.output.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}

function hasPreset(presets: readonly string[], name: string): boolean {
  return presets.includes(name);
}

function entriesInclude(entries: readonly string[], basename: string): boolean {
  return entries.some((entry) => entry === basename || entry.endsWith(`/${basename}`));
}

/** Soft config warnings for known packages / playwright / next root-module conflicts. */
export function collectPresetConflictWarnings(project: GlobalProject): string[] {
  if (!hasPreset(project.presets, 'packages')) {
    return [];
  }
  const allowed = new Set(packagesAllowedRootModules(project.presetConfig));
  const warnings: string[] = [];
  if (hasPreset(project.presets, 'playwright') && !allowed.has(PLAYWRIGHT_CONFIG)) {
    warnings.push(
      `verify: preset conflict: packages + playwright require ${PLAYWRIGHT_CONFIG} in presetConfig.packages.allowedRootModules`,
    );
  }
  if (entriesInclude(project.entries, NEXT_CONFIG) && !allowed.has(NEXT_CONFIG)) {
    warnings.push(
      `verify: preset conflict: packages requires ${NEXT_CONFIG} in presetConfig.packages.allowedRootModules when ${NEXT_CONFIG} is in entries`,
    );
  }
  return warnings;
}
