import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { readTextFile, writeTextFile } from '#system/process/files/files.js';

export async function writeJsonProjectFile(
  cwd: string,
  relativePath: string,
  value: object,
): Promise<void> {
  await writeTextFile(join(cwd, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

export async function installManagedFromExample(
  managedPath: string,
  examplePath: string,
): Promise<void> {
  await mkdir(dirname(managedPath), { recursive: true });
  await writeTextFile(managedPath, await readTextFile(examplePath));
}

export async function writeTypeScriptProject(
  root: string,
  name: string,
  source: string,
): Promise<void> {
  await writeNodeNextProjectScaffold(root, name);
  await writeTextFile(join(root, 'src', 'index.ts'), source);
}

export async function writeNodeNextProjectScaffold(cwd: string, name: string): Promise<void> {
  await mkdir(join(cwd, 'src'), { recursive: true });
  await writeJsonProjectFile(cwd, 'package.json', {
    name,
    private: true,
    type: 'module',
    main: 'src/index.ts',
  });
  await writeNodeNextTypeScriptConfig(cwd, { include: ['src/**/*.ts'] });
}

export async function writeNodeNextTypeScriptConfig(
  cwd: string,
  options: { include: string[]; types?: string[] },
): Promise<void> {
  await writeJsonProjectFile(cwd, 'tsconfig.json', {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022',
      ...(options.types === undefined ? {} : { types: options.types }),
    },
    include: options.include,
  });
}
