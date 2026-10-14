import { join } from 'node:path';
import { YAML } from 'bun';

import { writeTextFile } from '#system/process/files/files.js';

export async function writeYamlConfig(directory: string, value: object): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

export function projectConfig(root: string, extra: object = {}) {
  return { projects: [{ root, entries: ['src/index.ts'], ...extra }] };
}

export function packagesPresetConfig(declaredDependencies: object): {
  layout: { packages: { allowedRootModules: string[]; declaredDependencies: object } };
} {
  return {
    layout: {
      packages: {
        allowedRootModules: ['config.ts'],
        declaredDependencies,
      },
    },
  };
}

/** Expected intrinsic UI overlay block in generated global/Fallow configs. */
export const intrinsicUiOverlayMatcher = {
  intrinsicInteractions: [
    {
      elements: ['canvas'],
      property: 'onDraw',
      classification: 'interaction',
      kind: 'pointer',
    },
  ],
  lifecycleCallbacks: ['onReady'],
  actionCompatibility: { pointer: ['dragTo', 'draw'] },
};

export async function createTempYamlConfig(
  makeTempDirectory: (prefix: string) => Promise<string>,
  prefix: string,
  value: object,
): Promise<string> {
  return writeYamlConfig(await makeTempDirectory(prefix), value);
}
