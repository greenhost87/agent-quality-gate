import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  absoluteImportFanInFromDot,
  cacheDirForProject,
} from '../../presets/single-consumer/fallow-import-fan-in.js';

const CONFIG_BASENAME = 'collapse-types.fallowrc.json';
const DOT_BASENAME = 'collapse-types.dot';

const DEFAULT_FALLOW_CONFIG = {
  entry: ['**/*.{ts,tsx}'],
  ignorePatterns: [
    '**/node_modules/**',
    '**/.*/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/tests/**',
    '**/__tests__/**',
  ],
  production: true,
} as const;

/** Absolute imported path → absolute importer paths from fallow viz. */
export async function loadImportFanIn(projectRoot: string): Promise<Map<string, string[]>> {
  const root = resolve(projectRoot);
  const cacheDir = cacheDirForProject(root);
  mkdirSync(cacheDir, { recursive: true });
  const configPath = join(cacheDir, CONFIG_BASENAME);
  writeFileSync(configPath, `${JSON.stringify(DEFAULT_FALLOW_CONFIG, null, 2)}\n`);
  return await absoluteImportFanInFromDot({
    projectRoot: root,
    fallowConfigPath: configPath,
    outPath: join(cacheDir, DOT_BASENAME),
    timeoutMessage: 'collapse-types: fallow viz exceeded timeout and was killed',
    failurePrefix: 'collapse-types: fallow viz failed\n',
  });
}
