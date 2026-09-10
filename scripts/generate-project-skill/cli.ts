#!/usr/bin/env bun

import { resolve } from 'node:path';

import { Option } from 'commander';

import { createCli, parseCli, reportCommandError } from '../../process/command/command.js';
import { generateProjectSkill } from './project-skill.js';

export const GENERATE_PROJECT_SKILL_USAGE = `Usage: bun run generate:project-skill -- <project-cwd> [--name <skill-name>] [--config <path>]

Generate a project-local Agent Skill from the effective AQG, Oxlint, Fallow,
TypeScript, formatter, and package settings.
`;

export function parseGenerateProjectSkillArgs(
  argv: readonly string[],
): GenerateProjectSkillArgs | 'help' {
  const program = createCli('generate-project-skill')
    .argument('<project-cwd>', 'Configured project root or a path inside it')
    .addOption(new Option('--name <skill-name>', 'Output skill name').default('code-rules'))
    .option('--config <path>', 'AQG global config path');
  if (parseCli(program, argv) === 'help') return 'help';
  const cwd = program.args[0];
  if (cwd === undefined || cwd.length === 0) {
    throw new Error('missing project-cwd');
  }
  const options = program.opts<{ name: string; config?: string }>();
  return {
    cwd: resolve(cwd),
    skillName: options.name,
    ...(options.config === undefined ? {} : { configPath: resolve(options.config) }),
  };
}

if (import.meta.main) {
  try {
    const args = parseGenerateProjectSkillArgs(process.argv.slice(2));
    if (args === 'help') {
      process.stdout.write(GENERATE_PROJECT_SKILL_USAGE);
    } else {
      const result = await generateProjectSkill(args);
      process.stdout.write(`${result.changed ? 'generated' : 'unchanged'}: ${result.skillPath}\n`);
    }
  } catch (error) {
    reportCommandError('generate-project-skill', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}

export type GenerateProjectSkillArgs = {
  cwd: string;
  skillName: string;
  configPath?: string;
};
