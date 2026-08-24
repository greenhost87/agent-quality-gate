import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../process/files/files.js';

import type { QualityRulesProject } from './quality-rules-project.types.js';

const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'quality-rules');
const createdProjects: string[] = [];

export async function createProject(fixture: string, entry: string): Promise<QualityRulesProject> {
  const cwd = await mkdtemp(join(tmpdir(), 'quality-rules-project-'));
  createdProjects.push(cwd);
  const packageJson = { name: 'quality-rules-fixture', private: true, type: 'module', main: entry };
  await writeTextFile(join(cwd, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  const tsconfig = {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['src/**/*.ts', 'tests/**/*.ts'],
  };
  await writeTextFile(join(cwd, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  await cp(join(FIXTURES_ROOT, fixture), cwd, { recursive: true });
  return { cwd, entry };
}

export async function removeCreatedProjects(): Promise<void> {
  await Promise.all(
    createdProjects.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
}
