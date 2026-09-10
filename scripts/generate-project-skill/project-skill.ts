import { mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import * as v from 'valibot';

import {
  verifyFallowConfigPathForProject,
  type EphemeralProjectConfigPaths,
} from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
  type GlobalProject,
} from '../../config/global-config/global-config.js';
import { resolveLinkedCheckoutRoot } from '../../config/linked-checkout/linked-checkout.js';
import { packagedFallowConfigPath } from '../../config/packaged-assets/packaged-assets.js';
import {
  FALLOW_CONFIG_NAME,
  readFallowConfigFile,
  readOxlintConfigFile,
} from '../../config/verify-config-files/verify-config-files.js';
import { runPresetPreflight } from '../../gate/execute-verify/preset-preflight.js';
import { writeFallowConfigWithEntries } from '../../gate/execute-verify/verify-tool-run.js';
import { pathExists, readJsonFile, writeTextIfChanged } from '../../process/files/files.js';
import { mergeIgnorePatterns } from '../../process/run-command/stream-utils.js';
import { collectOxlintRules, renderProjectSkill } from './render-project-skill.js';

const ObjectSchema = v.looseObject({});
const SkillNameSchema = v.pipe(
  v.string(),
  v.regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    'skill name must use lowercase letters, numbers, and single hyphens',
  ),
  v.maxLength(64, 'skill name must be at most 64 characters'),
);

export type GenerateProjectSkillOptions = {
  cwd: string;
  skillName?: string;
  configPath?: string;
};

export type GeneratedProjectSkill = {
  projectRoot: string;
  skillPath: string;
  changed: boolean;
};

function configuredProject(cwd: string, projects: readonly GlobalProject[]): GlobalProject {
  const project = findProjectForCwd(cwd, projects);
  if (project === undefined) {
    throw new Error(`no configured AQG project contains ${resolve(cwd)}`);
  }
  return project;
}

async function optionalJson(path: string): Promise<Record<string, unknown> | undefined> {
  if (!(await pathExists(path))) return undefined;
  return readJsonFile(path, ObjectSchema);
}

export async function generateProjectSkill(
  options: GenerateProjectSkillOptions,
): Promise<GeneratedProjectSkill> {
  const skillName = v.parse(SkillNameSchema, options.skillName ?? 'code-rules');
  const globalConfig = await readGlobalQualityGateConfig(options.configPath);
  const project = configuredProject(options.cwd, globalConfig.projects);
  const projectRoot = resolveLinkedCheckoutRoot(options.cwd, project.root);
  const ephemeral: EphemeralProjectConfigPaths = { fallowConfigPaths: [] };
  const preflight = await runPresetPreflight(
    projectRoot,
    project.presets,
    project.presetConfig,
    true,
    ephemeral,
    {
      ...(globalConfig.verify?.lintGroups === undefined
        ? {}
        : { groupOrder: globalConfig.verify.lintGroups }),
      ...(globalConfig.verify?.boundaryPluginPriority === undefined
        ? {}
        : { boundaryPluginPriority: globalConfig.verify.boundaryPluginPriority }),
    },
  );
  if ('exitCode' in preflight) {
    throw new Error('AQG could not materialize the merged Oxlint policy');
  }

  const packagedFallow = await readFallowConfigFile(packagedFallowConfigPath(), FALLOW_CONFIG_NAME);
  const ignorePatterns = mergeIgnorePatterns(
    packagedFallow.ignorePatterns ?? [],
    project.ignorePatterns ?? [],
  );
  const fallowPath = await writeFallowConfigWithEntries(
    packagedFallowConfigPath(),
    projectRoot,
    project.entries,
    ignorePatterns,
    [],
    undefined,
    verifyFallowConfigPathForProject(projectRoot),
  );
  const [oxlintConfig, fallowConfig, tsconfig, formatter, packageJson] = await Promise.all([
    Promise.resolve(readOxlintConfigFile(preflight.oxlintConfigPath)),
    readFallowConfigFile(fallowPath, 'generated Fallow config'),
    optionalJson(join(projectRoot, 'tsconfig.json')),
    optionalJson(join(projectRoot, '.oxfmtrc.json')),
    optionalJson(join(projectRoot, 'package.json')),
  ]);
  const renderInput = {
    skillName,
    projectName: typeof packageJson?.name === 'string' ? packageJson.name : basename(projectRoot),
    project,
    oxlintRows: collectOxlintRules(oxlintConfig),
    fallowConfig,
    formatter,
    tsconfig,
  };
  const skillDirectory = join(projectRoot, '.agents', 'skills', skillName);
  const skillPath = join(skillDirectory, 'SKILL.md');
  await mkdir(skillDirectory, { recursive: true });
  const changed = await writeTextIfChanged(skillPath, renderProjectSkill(renderInput));
  return { projectRoot, skillPath, changed };
}
