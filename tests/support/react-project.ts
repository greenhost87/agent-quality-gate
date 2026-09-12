import { write } from 'bun';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { makeTrackedTempDirectory } from './tracked-temp-directories.js';

export async function createReactProject(tempDirectories: string[]): Promise<string> {
  const cwd = await makeTrackedTempDirectory(tempDirectories, 'aqg-react-project-');
  await write(
    join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'sample-react-fixture', private: true, type: 'module' }, null, 2)}\n`,
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
