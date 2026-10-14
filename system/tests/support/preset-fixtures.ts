import { join } from 'node:path';

import { writeTextFile } from '#system/process/files/files.js';

export function namedPresetRoots(
  makeTempDirectory: (prefix: string) => Promise<string>,
  prefix: string,
): (name: string) => Promise<string> {
  return async (name: string) => {
    const root = await makeTempDirectory(`${prefix}${name}-`);
    await writePresetManifest(root, name);
    return root;
  };
}

export async function writePresetManifest(directory: string, name: string): Promise<void> {
  await writeTextFile(
    join(directory, 'manifest.json'),
    `${JSON.stringify(
      {
        name,
        requires: [],
        files: [],
        dependencies: [],
        oxlint: { nativePlugins: [], plugins: [], rules: {}, overrides: [] },
      },
      null,
      2,
    )}\n`,
  );
}
