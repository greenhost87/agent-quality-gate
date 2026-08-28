import { write } from 'bun';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

async function makeTrackedTempDirectory(
  tempDirectories: string[],
  prefix: string,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

export async function removeTrackedTempDirectories(tempDirectories: string[]): Promise<void> {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
}

export async function createReactProject(tempDirectories: string[]): Promise<string> {
  const cwd = await makeTrackedTempDirectory(tempDirectories, 'aqg-react-project-');
  await write(
    join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'react-presentation-fixture', private: true, type: 'module' }, null, 2)}\n`,
  );
  await write(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['**/*.tsx', '**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  return cwd;
}

export async function writeSource(
  projectRoot: string,
  relativePath: string,
  source: string,
): Promise<string> {
  const absolute = join(projectRoot, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await write(absolute, source);
  return absolute;
}
