import { isAbsolute, join } from 'node:path';

import { YAML } from 'bun';
import * as v from 'valibot';

import { agentQualityGateHome } from '../agent-quality-gate-home/agent-quality-gate-home.js';
import { invalidProjectRelativeEntries } from '../entries/entries.js';
import { findLinkedCheckoutProject } from '../linked-checkout/linked-checkout.js';
import { packagedGlobalConfigTemplatePath } from '../packaged-assets/packaged-assets.js';
import { canonicalizePath, pathIsInside, selectDeepestRoot } from '../../process/files/paths.js';
import { isResolvablePresetName } from '../../preset-catalog/catalog/preset-catalog.js';
import { pathExists, readTextFile, writeTextFile } from '../../process/files/files.js';
import { collectPresetConflictWarnings } from './preset-conflict-warnings.ts';

const GLOBAL_CONFIG_TEMPLATE_PATH = packagedGlobalConfigTemplatePath();

const StringArraySchema = v.pipe(
  v.array(v.unknown()),
  v.transform((items) =>
    items
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim()),
  ),
);

function defaultGlobalConfigPath(): string {
  return join(agentQualityGateHome(), 'config.yaml');
}

function resolvePresets(input: LoosePresets): string[] {
  return (input.presets ?? []).filter(
    (preset): preset is string => typeof preset === 'string' && isResolvablePresetName(preset),
  );
}

function nonEmptyStringArray(input: LooseStringArray): string[] | undefined {
  const parsed = v.safeParse(StringArraySchema, input.items ?? []);
  return parsed.success && parsed.output.length > 0 ? parsed.output : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return v.is(v.looseObject({}), value);
}

function parsePresetConfigBag(raw: object | undefined): Record<string, object> {
  if (raw === undefined || !isPlainObject(raw)) {
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

function projectFromRaw(raw: ProjectRaw): GlobalProject | null {
  if (raw.root === undefined || !isAbsolute(raw.root)) {
    return null;
  }
  const entries = nonEmptyStringArray({ items: raw.entries });
  if (entries === undefined || invalidProjectRelativeEntries(entries) !== undefined) {
    return null;
  }
  const presets = resolvePresets(raw);
  const ignorePatterns = nonEmptyStringArray({ items: raw.ignorePatterns });
  const project: GlobalProject = {
    root: canonicalizePath(raw.root),
    entries,
    presets,
    presetConfig: parsePresetConfigBag(raw.presetConfig),
    warnings: [],
    ...(ignorePatterns === undefined ? {} : { ignorePatterns }),
  };
  project.warnings = collectPresetConflictWarnings(project);
  return project;
}

const ProjectSchemaRaw = v.looseObject({
  root: v.optional(v.string()),
  entries: v.optional(v.array(v.unknown())),
  presets: v.optional(v.array(v.unknown())),
  ignorePatterns: v.optional(v.array(v.unknown())),
  presetConfig: v.optional(v.looseObject({})),
});

const ProjectSchema = v.pipe(
  ProjectSchemaRaw,
  v.transform((raw): GlobalProject | null => projectFromRaw(raw)),
);

const VerifySettingsSchema = v.looseObject({
  lintGroups: v.optional(v.array(v.unknown())),
  boundaryPluginPriority: v.optional(v.array(v.unknown())),
});

const GlobalQualityGateConfigSchema = v.pipe(
  v.looseObject({
    projects: v.optional(v.array(v.unknown()), []),
    verify: v.optional(VerifySettingsSchema),
  }),
  v.transform((raw): GlobalQualityGateConfig => {
    const projects: GlobalProject[] = [];
    const roots = new Set<string>();
    for (const item of raw.projects) {
      const parsed = v.safeParse(ProjectSchema, item);
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
  if (lintGroups === undefined && boundaryPluginPriority === undefined) {
    return undefined;
  }
  return {
    ...(lintGroups === undefined ? {} : { lintGroups }),
    ...(boundaryPluginPriority === undefined ? {} : { boundaryPluginPriority }),
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
  presets?: readonly unknown[];
};

export type ProjectRaw = {
  root?: string;
  entries?: readonly unknown[];
  presets?: readonly unknown[];
  ignorePatterns?: readonly unknown[];
  presetConfig?: object;
};

export type GlobalProject = {
  root: string;
  entries: string[];
  presets: string[];
  ignorePatterns?: string[];
  presetConfig: Record<string, object>;
  /** Soft config warnings (e.g. packages + playwright allowlist conflicts). */
  warnings: string[];
};

export type VerifySettings = {
  /** Ordered oxlint output group ids; first non-empty group gates the run. */
  lintGroups?: string[];
  /** Plugin order inside the `boundaries` group expansion. */
  boundaryPluginPriority?: string[];
};

export type VerifySettingsRaw = {
  lintGroups?: readonly unknown[];
  boundaryPluginPriority?: readonly unknown[];
};

export type GlobalQualityGateConfig = {
  projects: GlobalProject[];
  /** Gate-wide verify tuning shared by every configured project. */
  verify?: VerifySettings;
  /** Flattened soft warnings from every project (also on each `GlobalProject.warnings`). */
  warnings: string[];
};
