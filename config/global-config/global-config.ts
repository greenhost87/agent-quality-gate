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

const GLOBAL_CONFIG_TEMPLATE_PATH = packagedGlobalConfigTemplatePath();

function defaultGlobalConfigPath(): string {
  return join(agentQualityGateHome(), 'config.yaml');
}

function configError(configPath: string, message: string): Error {
  return new Error(`${configPath}: ${message}`);
}

function normalizeModulePlacementDirectory(directory: string): string {
  return directory.replace(/\/+$/u, '');
}

function isProjectRelativeDirectory(directory: string): boolean {
  return directory.length > 0 && !directory.startsWith('/') && !directory.includes('..');
}

const ProjectRelativeDirectorySchema = v.pipe(
  v.string(),
  v.check(isProjectRelativeDirectory, 'must be a project-relative path'),
  v.transform(normalizeModulePlacementDirectory),
);

const PackageBoundariesSchema = v.strictObject({
  allowedRootModules: v.array(v.string()),
  declaredDependencies: v.record(v.string(), v.array(v.string())),
});

export type PackageBoundariesConfig = v.InferOutput<typeof PackageBoundariesSchema>;

const ModulePlacementSchema = v.pipe(
  v.strictObject({
    directories: v.array(ProjectRelativeDirectorySchema),
    rootExceptions: v.optional(v.record(v.string(), v.array(v.string())), {}),
  }),
  v.rawTransform(({ dataset, addIssue }) => {
    const rootExceptions: Record<string, string[]> = {};
    for (const [directory, exceptions] of Object.entries(dataset.value.rootExceptions)) {
      if (!isProjectRelativeDirectory(directory)) {
        addIssue({
          message: `modulePlacement.rootExceptions key "${directory}" must be a project-relative path`,
        });
        return { directories: dataset.value.directories, rootExceptions: {} };
      }
      const normalized = normalizeModulePlacementDirectory(directory);
      if (!dataset.value.directories.includes(normalized)) {
        addIssue({
          message: `modulePlacement.rootExceptions.${directory} must name a configured directory`,
        });
        return { directories: dataset.value.directories, rootExceptions: {} };
      }
      rootExceptions[normalized] = exceptions;
    }
    return {
      directories: dataset.value.directories,
      rootExceptions,
    };
  }),
);

export type ModulePlacementConfig = v.InferOutput<typeof ModulePlacementSchema>;

const MaxInlineParameterObjectMembersSchema = v.pipe(
  v.number(),
  v.integer(),
  v.check((value) => value === -1 || value >= 0, 'must be -1 or a non-negative integer'),
);

const BaselineSchema = v.strictObject({
  maxInlineParameterObjectMembers: MaxInlineParameterObjectMembersSchema,
});

export type BaselineConfig = v.InferOutput<typeof BaselineSchema>;

const ProjectSchema = v.pipe(
  v.strictObject({
    root: v.string(),
    entries: v.pipe(v.array(v.string()), v.minLength(1)),
    presets: v.optional(v.array(v.string()), []),
    ignorePatterns: v.optional(v.array(v.string())),
    packageBoundaries: v.optional(PackageBoundariesSchema),
    modulePlacement: v.optional(ModulePlacementSchema),
    baseline: v.optional(BaselineSchema),
  }),
  v.rawTransform(({ dataset, addIssue }) => {
    const value = dataset.value;
    const empty = {
      root: value.root,
      entries: value.entries,
      presets: [] as string[],
      ignorePatterns: undefined as string[] | undefined,
      packageBoundaries: undefined as PackageBoundariesConfig | undefined,
      modulePlacement: undefined as ModulePlacementConfig | undefined,
      baseline: undefined as BaselineConfig | undefined,
    };
    if (!isAbsolute(value.root)) {
      addIssue({ message: 'root must be an absolute path' });
      return empty;
    }
    const entryError = invalidProjectRelativeEntries(value.entries);
    if (entryError !== undefined) {
      addIssue({ message: entryError });
      return empty;
    }
    const resolvedPresets: string[] = [];
    for (const preset of value.presets) {
      if (!isResolvablePresetName(preset)) {
        addIssue({ message: `unknown preset "${preset}"` });
        return empty;
      }
      resolvedPresets.push(preset);
    }
    if (value.packageBoundaries !== undefined && !resolvedPresets.includes('packages')) {
      addIssue({ message: 'packageBoundaries requires the packages preset' });
      return empty;
    }
    if (value.modulePlacement !== undefined && !resolvedPresets.includes('module-placement')) {
      addIssue({ message: 'modulePlacement requires the module-placement preset' });
      return empty;
    }
    return {
      root: canonicalizePath(value.root),
      entries: value.entries,
      presets: resolvedPresets,
      ignorePatterns: value.ignorePatterns,
      packageBoundaries: value.packageBoundaries,
      modulePlacement: value.modulePlacement,
      baseline: value.baseline,
    };
  }),
);

export type GlobalProject = v.InferOutput<typeof ProjectSchema>;

const GlobalQualityGateConfigSchema = v.pipe(
  v.strictObject({
    projects: v.array(ProjectSchema, 'projects must be an array'),
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) {
      return;
    }
    const roots = new Set<string>();
    for (const project of dataset.value.projects) {
      if (roots.has(project.root)) {
        addIssue({
          message: `project roots must be unique, duplicated "${project.root}"`,
        });
        return;
      }
      roots.add(project.root);
    }
  }),
);

export type GlobalQualityGateConfig = v.InferOutput<typeof GlobalQualityGateConfigSchema>;

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
    return { projects: [] };
  }
  let raw: unknown;
  try {
    raw = YAML.parse(await readTextFile(configPath));
  } catch {
    throw configError(configPath, 'must contain valid YAML');
  }
  const result = v.safeParse(GlobalQualityGateConfigSchema, raw);
  if (!result.success) {
    throw configError(configPath, result.issues[0].message);
  }
  return result.output;
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
