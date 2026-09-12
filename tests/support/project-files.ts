import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { writeTextFile } from '../../process/files/files.js';

export async function writeJsonProjectFile(
  cwd: string,
  relativePath: string,
  value: object,
): Promise<void> {
  await writeTextFile(join(cwd, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeNodeNextProjectScaffold(cwd: string, name: string): Promise<void> {
  await mkdir(join(cwd, 'src'));
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
