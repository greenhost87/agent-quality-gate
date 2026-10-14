import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGenerateProjectSkillArgs } from '#system/scripts/generate-project-skill/cli.ts';
import { generateProjectSkill } from '#system/scripts/generate-project-skill/project-skill.ts';
import { collectOxlintRules } from '#system/scripts/generate-project-skill/render-project-skill.ts';
import { readTextFile, writeTextFile } from '#system/process/files/files.ts';
import { useTrackedTempDirectories } from '../support/tracked-temp-directories.ts';

const { tempDirectories: temporaryDirectories } = useTrackedTempDirectories();

test('parses project skill generator arguments', () => {
  expect(parseGenerateProjectSkillArgs(['/project'])).toEqual({
    cwd: '/project',
    skillName: 'code-rules',
  });
  expect(parseGenerateProjectSkillArgs(['/project', '--name', 'project-rules'])).toEqual({
    cwd: '/project',
    skillName: 'project-rules',
  });
  expect(parseGenerateProjectSkillArgs(['--help'])).toBe('help');
  expect(() => parseGenerateProjectSkillArgs([])).toThrow('missing project-cwd');
});

test('collects base and override Oxlint rules with their scopes', () => {
  expect(
    collectOxlintRules({
      rules: { 'no-debugger': 'error' },
      overrides: [{ files: ['**/*.ts'], rules: { 'typescript/no-explicit-any': 'error' } }],
    }),
  ).toEqual([
    { scope: 'all files', id: 'no-debugger', value: 'error' },
    { scope: '**/*.ts', id: 'typescript/no-explicit-any', value: 'error' },
  ]);
});

test('generates the skill in the configured target project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aqg-project-skill-'));
  temporaryDirectories.push(root);
  const configPath = join(root, 'config.yaml');
  await Promise.all([
    writeTextFile(join(root, 'entry.ts'), 'export const value = 1;\n'),
    writeTextFile(join(root, 'package.json'), '{"name":"sample-app"}\n'),
    writeTextFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}\n'),
    writeTextFile(join(root, '.oxfmtrc.json'), '{"singleQuote":true}\n'),
    writeTextFile(
      configPath,
      ['projects:', `  - root: ${root}`, '    entries:', '      - entry.ts', ''].join('\n'),
    ),
  ]);

  const generated = await generateProjectSkill({
    cwd: root,
    skillName: 'sample-code-rules',
    configPath,
  });

  expect(generated.changed).toBe(true);
  expect(generated.skillPath).toBe(
    join(generated.projectRoot, '.agents', 'skills', 'sample-code-rules', 'SKILL.md'),
  );
  const skill = await readTextFile(generated.skillPath);
  expect(skill).toContain('name: sample-code-rules');
  expect(skill).toContain('# sample-app code rules');
  expect(skill).not.toMatch(/AQG|Agent Quality Gate|Oxlint|Fallow/u);

  const unchanged = await generateProjectSkill({
    cwd: root,
    skillName: 'sample-code-rules',
    configPath,
  });
  expect(unchanged.changed).toBe(false);
});
