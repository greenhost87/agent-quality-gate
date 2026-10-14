import { isAbsolute, join } from 'node:path';

import { YAML } from 'bun';
import * as v from 'valibot';

import { agentQualityGateHome } from '../agent-quality-gate-home.js';
import { invalidProjectRelativeEntries } from '../entries/entries.js';
import { findLinkedCheckoutProject } from '../linked-checkout/linked-checkout.js';
import { packagedGlobalConfigTemplatePath } from '../packaged-assets/packaged-assets.js';
import { canonicalizePath, pathIsInside, selectDeepestRoot } from '#system/process/files/paths.js';
import { isResolvablePresetName } from '#system/presets/preset-catalog.js';
import { pathExists, readTextFile, writeTextFile } from '#system/process/files/files.js';
import { collectPresetConflictWarnings } from './preset-conflict-warnings.ts';

const GLOBAL_CONFIG_TEMPLATE_PATH = packagedGlobalConfigTemplatePath();

const UnknownArraySchema = v.array(v.unknown());

const StringArraySchema = v.pipe(
  UnknownArraySchema,
  v.transform((items) =>
    items
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim()),
  ),
);

function defaultGlobalConfigPath(): string {
  return join(agentQualityGateHome(), 'config.yaml');
}

function resolvePresetSections(input: LoosePresets): ResolvedPresetSections {
  const array = v.safeParse(UnknownArraySchema, input.presets);
  if (array.success) {
    return {
      presets: array.output.filter(
        (preset): preset is string => typeof preset === 'string' && isResolvablePresetName(preset),
      ),
      presetConfig: {},
    };
  }
  if (!isPlainObject(input.presets)) {
    return { presets: [], presetConfig: {} };
  }
  const presets: string[] = [];
  const presetConfig: Record<string, object> = {};
  for (const [name, config] of Object.entries(input.presets)) {
    if (isResolvablePresetName(name)) {
      presets.push(name);
    }
    if (isPlainObject(config)) {
      presetConfig[name] = config;
    }
  }
  return { presets, presetConfig };
}

function nonEmptyStringArray(input: LooseStringArray): string[] | undefined {
  const parsed = v.safeParse(StringArraySchema, input.items ?? []);
  return parsed.success && parsed.output.length > 0 ? parsed.output : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return v.is(v.looseObject({}), value);
}

function parsePresetConfigBag(raw: object | undefined): Record<string, object> {
  if (raw === undefined) {
    return {};
  }
  const result: Record<string, object> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isPlainObject(value)) {
      result[key] = value;
    }
  }
  return result;
}

const AutoFixSchema = v.strictObject({
  oxlint: v.optional(v.boolean()),
  fallow: v.optional(v.boolean()),
});

function hasInvalidProjectOptionShapes(raw: ProjectRaw): boolean {
  const presetsInvalid =
    raw.presets !== undefined &&
    !v.safeParse(UnknownArraySchema, raw.presets).success &&
    !isPlainObject(raw.presets);
  const presetConfigInvalid = raw.presetConfig !== undefined && !isPlainObject(raw.presetConfig);
  const intrinsicInteractionsInvalid =
    raw.intrinsicInteractions !== undefined &&
    !v.safeParse(v.array(v.looseObject({})), raw.intrinsicInteractions).success;
  const lifecycleCallbacksInvalid =
    raw.lifecycleCallbacks !== undefined &&
    !v.safeParse(v.array(v.string()), raw.lifecycleCallbacks).success;
  const actionCompatibilityInvalid =
    raw.actionCompatibility !== undefined &&
    !v.safeParse(v.record(v.string(), v.array(v.string())), raw.actionCompatibility).success;
  const autoFixInvalid =
    raw.autoFix !== undefined && !v.safeParse(AutoFixSchema, raw.autoFix).success;
  return (
    presetsInvalid ||
    presetConfigInvalid ||
    intrinsicInteractionsInvalid ||
    lifecycleCallbacksInvalid ||
    actionCompatibilityInvalid ||
    autoFixInvalid
  );
}

function projectFromRaw(raw: ProjectRaw): GlobalProject | null {
  if (raw.root === undefined || !isAbsolute(raw.root)) {
    return null;
  }
  const entries = nonEmptyStringArray({ items: raw.entries });
  if (entries === undefined || invalidProjectRelativeEntries(entries) !== undefined) {
    return null;
  }
  const ignorePatterns = nonEmptyStringArray({ items: raw.ignorePatterns });
  if (hasInvalidProjectOptionShapes(raw)) return null;
  const intrinsicInteractions = v.safeParse(v.array(v.looseObject({})), raw.intrinsicInteractions);
  const lifecycleCallbacks = v.safeParse(v.array(v.string()), raw.lifecycleCallbacks);
  const actionCompatibility = v.safeParse(
    v.record(v.string(), v.array(v.string())),
    raw.actionCompatibility,
  );
  const presetSections = resolvePresetSections(raw);
  const legacyPresetConfig = parsePresetConfigBag(
    isPlainObject(raw.presetConfig) ? raw.presetConfig : undefined,
  );
  const autoFix = v.safeParse(AutoFixSchema, raw.autoFix);
  const project: GlobalProject = {
    root: canonicalizePath(raw.root),
    entries,
    presets: presetSections.presets,
    presetConfig: { ...legacyPresetConfig, ...presetSections.presetConfig },
    warnings: [],
    ...(autoFix.success ? { autoFix: autoFix.output } : {}),
    ...(ignorePatterns === undefined ? {} : { ignorePatterns }),
    ...(intrinsicInteractions.success
      ? { intrinsicInteractions: intrinsicInteractions.output }
      : {}),
    ...(lifecycleCallbacks.success ? { lifecycleCallbacks: lifecycleCallbacks.output } : {}),
    ...(actionCompatibility.success ? { actionCompatibility: actionCompatibility.output } : {}),
  };
  project.warnings = collectPresetConflictWarnings(project);
  return project;
}

const ProjectSchemaRaw = v.looseObject({
  root: v.optional(v.string()),
  entries: v.optional(v.array(v.unknown())),
  presets: v.optional(v.unknown()),
  ignorePatterns: v.optional(v.array(v.unknown())),
  intrinsicInteractions: v.optional(v.unknown()),
  lifecycleCallbacks: v.optional(v.unknown()),
  actionCompatibility: v.optional(v.unknown()),
  presetConfig: v.optional(v.unknown()),
  autoFix: v.optional(v.unknown()),
});

const ProjectSchema = v.pipe(
  ProjectSchemaRaw,
  v.transform((raw): GlobalProject | null => projectFromRaw(raw)),
);

function isMergeableObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && !v.is(UnknownArraySchema, value);
}

function mergeObjects(defaults: object, overrides: object): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, overrideValue] of Object.entries(overrides)) {
    const defaultValue = merged[key];
    merged[key] =
      isMergeableObject(defaultValue) && isMergeableObject(overrideValue)
        ? mergeObjects(defaultValue, overrideValue)
        : overrideValue;
  }
  return merged;
}

function mergeProjectDefaults(defaults: object, project: object): Record<string, unknown> {
  const sharedFields: Record<string, unknown> = { ...defaults };
  delete sharedFields.root;
  return mergeObjects(sharedFields, project);
}

const VerifySettingsSchema = v.looseObject({
  lintGroups: v.optional(v.array(v.unknown())),
  boundaryPluginPriority: v.optional(v.array(v.unknown())),
  agentRunLogs: v.optional(v.unknown()),
});

const GlobalQualityGateConfigSchema = v.pipe(
  v.looseObject({
    projectDefaults: v.optional(v.unknown()),
    projects: v.optional(v.array(v.unknown()), []),
    verify: v.optional(VerifySettingsSchema),
  }),
  v.transform((raw): GlobalQualityGateConfig => {
    const projects: GlobalProject[] = [];
    const roots = new Set<string>();
    const projectDefaults = isMergeableObject(raw.projectDefaults) ? raw.projectDefaults : {};
    for (const item of raw.projects) {
      if (!isMergeableObject(item)) {
        continue;
      }
      const parsed = v.safeParse(ProjectSchema, mergeProjectDefaults(projectDefaults, item));
      if (!parsed.success) {
        continue;
      }
      const project = parsed.output;
      if (project === null || roots.has(project.root)) {
        continue;
      }
      roots.add(project.root);
      projects.push(project);
    }
    const warnings = projects.flatMap((project) => project.warnings);
    if (raw.verify === undefined) {
      return { projects, warnings };
    }
    return { projects, warnings, verify: parseVerifySettings(raw.verify) };
  }),
);

function parseVerifySettings(raw: VerifySettingsRaw): VerifySettings | undefined {
  const lintGroups = nonEmptyStringArray({ items: raw.lintGroups });
  const boundaryPluginPriority = nonEmptyStringArray({ items: raw.boundaryPluginPriority });
  const agentRunLogs = typeof raw.agentRunLogs === 'boolean' ? raw.agentRunLogs : undefined;
  if (
    lintGroups === undefined &&
    boundaryPluginPriority === undefined &&
    agentRunLogs === undefined
  ) {
    return undefined;
  }
  return {
    ...(lintGroups === undefined ? {} : { lintGroups }),
    ...(boundaryPluginPriority === undefined ? {} : { boundaryPluginPriority }),
    ...(agentRunLogs === undefined ? {} : { agentRunLogs }),
  };
}

export async function createGlobalQualityGateConfig(
  configPath = defaultGlobalConfigPath(),
): Promise<string | undefined> {
  if (await pathExists(configPath)) {
    return undefined;
  }
  try {
    await writeTextFile(configPath, await readTextFile(GLOBAL_CONFIG_TEMPLATE_PATH));
  } catch (error) {
    if (await pathExists(configPath)) {
      return undefined;
    }
    throw error;
  }
  return configPath;
}

export async function readGlobalQualityGateConfig(
  configPath = defaultGlobalConfigPath(),
): Promise<GlobalQualityGateConfig> {
  if (!(await pathExists(configPath))) {
    return { projects: [], warnings: [] };
  }
  try {
    const result = v.safeParse(
      GlobalQualityGateConfigSchema,
      YAML.parse(await readTextFile(configPath)),
    );
    return result.success ? result.output : { projects: [], warnings: [] };
  } catch {
    return { projects: [], warnings: [] };
  }
}

export function findProjectForCwd(
  cwd: string,
  projects: readonly GlobalProject[],
): GlobalProject | undefined {
  const resolvedCwd = canonicalizePath(cwd);
  return (
    selectDeepestRoot(projects, (project) => pathIsInside(project.root, resolvedCwd)) ??
    findLinkedCheckoutProject(resolvedCwd, projects)
  );
}

export type LooseStringArray = {
  items?: readonly unknown[];
};

export type LoosePresets = {
  presets?: unknown;
};

type ResolvedPresetSections = {
  presets: string[];
  presetConfig: Record<string, object>;
};

export type ProjectRaw = {
  root?: string;
  entries?: readonly unknown[];
  presets?: unknown;
  ignorePatterns?: readonly unknown[];
  intrinsicInteractions?: unknown;
  lifecycleCallbacks?: unknown;
  actionCompatibility?: unknown;
  presetConfig?: unknown;
  autoFix?: unknown;
};

export type GlobalProject = {
  root: string;
  entries: string[];
  presets: string[];
  ignorePatterns?: string[];
  autoFix?: { oxlint?: boolean; fallow?: boolean };
  intrinsicInteractions?: Record<string, unknown>[];
  lifecycleCallbacks?: string[];
  actionCompatibility?: Record<string, string[]>;
  presetConfig: Record<string, object>;
  /** Soft config warnings (e.g. packages + playwright allowlist conflicts). */
  warnings: string[];
};

export type VerifySettings = {
  /** Ordered oxlint output group ids; first non-empty group gates the run. */
  lintGroups?: string[];
  /** Plugin order inside the `boundaries` group expansion. */
  boundaryPluginPriority?: string[];
  /** Write full agent-facing verify output under the AQG home directory. Defaults to true. */
  agentRunLogs?: boolean;
};

export type VerifySettingsRaw = {
  lintGroups?: readonly unknown[];
  boundaryPluginPriority?: readonly unknown[];
  agentRunLogs?: unknown;
};

export type GlobalQualityGateConfig = {
  projects: GlobalProject[];
  /** Gate-wide verify tuning shared by every configured project. */
  verify?: VerifySettings;
  /** Flattened soft warnings from every project (also on each `GlobalProject.warnings`). */
  warnings: string[];
};
