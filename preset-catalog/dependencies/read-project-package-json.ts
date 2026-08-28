import { join } from 'node:path';
import * as v from 'valibot';

import { pathExists, readJsonFile } from '../../process/files/files.js';
import type { PresetDependencySection } from '../contract/preset-dependency-sections.js';

const DependencyMapSchema = v.record(v.string(), v.string());

const ProjectPackageJsonSchema = v.looseObject({
  dependencies: v.optional(v.looseObject({})),
  devDependencies: v.optional(v.looseObject({})),
  optionalDependencies: v.optional(v.looseObject({})),
  peerDependencies: v.optional(v.looseObject({})),
  scripts: v.optional(v.looseObject({})),
  ignoreScripts: v.optional(v.union([v.array(v.string()), v.looseObject({})])),
});

export type ProjectPackageJson = v.InferOutput<typeof ProjectPackageJsonSchema>;

export async function readProjectPackageJson(
  projectRoot: string,
): Promise<ProjectPackageJson | undefined> {
  const path = join(projectRoot, 'package.json');
  if (!(await pathExists(path))) {
    return undefined;
  }
  try {
    return await readJsonFile(path, ProjectPackageJsonSchema);
  } catch {
    return undefined;
  }
}

export function packageJsonDependencySection(
  packageJson: ProjectPackageJson | undefined,
  section: PresetDependencySection,
): Record<string, string> | undefined {
  if (packageJson === undefined) {
    return undefined;
  }
  const result = v.safeParse(DependencyMapSchema, packageJson[section]);
  return result.success ? result.output : undefined;
}
