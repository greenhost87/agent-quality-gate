import type { GlobalProject } from './global-config.ts';
import * as v from 'valibot';

const PLAYWRIGHT_CONFIG = 'playwright.config.ts';
const NEXT_CONFIG = 'next.config.ts';

const PlainObjectSchema = v.looseObject({});
type PlainObject = v.InferOutput<typeof PlainObjectSchema>;

function isPlainObject(value: unknown): value is PlainObject {
  return v.is(PlainObjectSchema, value);
}

function packagesSectionOf(project: GlobalProject): PlainObject | undefined {
  const layout = isPlainObject(project.presetConfig.layout)
    ? project.presetConfig.layout
    : undefined;
  const fromLayout =
    layout !== undefined && isPlainObject(layout.packages) ? layout.packages : undefined;
  const fromLegacy = isPlainObject(project.presetConfig.packages)
    ? project.presetConfig.packages
    : undefined;
  return fromLayout ?? fromLegacy;
}

function packagesAllowedRootModules(project: GlobalProject): string[] {
  const packages = packagesSectionOf(project);
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

function entriesInclude(entries: readonly string[], basename: string): boolean {
  return entries.some((entry) => entry === basename || entry.endsWith(`/${basename}`));
}

function packagesConfigPathHint(project: GlobalProject): string {
  const layout = isPlainObject(project.presetConfig.layout)
    ? project.presetConfig.layout
    : undefined;
  if (layout !== undefined && isPlainObject(layout.packages)) {
    return 'presetConfig.layout.packages.allowedRootModules';
  }
  return 'presetConfig.packages.allowedRootModules';
}

/** Soft config warnings for known packages / playwright / next root-module conflicts. */
export function collectPresetConflictWarnings(project: GlobalProject): string[] {
  const packagesSection = packagesSectionOf(project);
  if (packagesSection === undefined) {
    return [];
  }
  const allowed = new Set(packagesAllowedRootModules(project));
  const hint = packagesConfigPathHint(project);
  const warnings: string[] = [];
  if (project.presets.includes('playwright') && !allowed.has(PLAYWRIGHT_CONFIG)) {
    warnings.push(
      `verify: preset conflict: packages + playwright require ${PLAYWRIGHT_CONFIG} in ${hint}`,
    );
  }
  if (entriesInclude(project.entries, NEXT_CONFIG) && !allowed.has(NEXT_CONFIG)) {
    warnings.push(
      `verify: preset conflict: packages requires ${NEXT_CONFIG} in ${hint} when ${NEXT_CONFIG} is in entries`,
    );
  }
  return warnings;
}
