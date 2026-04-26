import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConfigBackedVerifyStepName, ResolvedDefaultConfigMap, ResolveDefaultConfigOptions } from './types.js';

const VERIFY_PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST_DEFAULT_CONFIGS_DIR = join(VERIFY_PACKAGE_ROOT, 'dist', 'default-configs');

const BUNDLED_CONFIG_FILES: Record<ConfigBackedVerifyStepName, string> = {
  eslint: 'eslint.config.mjs',
  'eslint-length': 'eslint-length.config.mjs',
  tsc: 'tsconfig.verify.json',
  knip: 'knip.json',
  jscpd: '.jscpd.json',
  'ast-grep': 'sgconfig.yml',
  'duplicate-shapes': 'tools/analyze/duplicate-shapes.config.json',
  depcruise: '.dependency-cruiser.cjs',
};

function resolveBundledConfigDir(candidateDir?: string): string {
  if (candidateDir) {
    return isAbsolute(candidateDir) ? candidateDir : join(process.cwd(), candidateDir);
  }
  if (existsSync(DIST_DEFAULT_CONFIGS_DIR)) {
    return DIST_DEFAULT_CONFIGS_DIR;
  }
  return VERIFY_PACKAGE_ROOT;
}

function resolveBundledConfigPath(bundledDir: string, stepName: ConfigBackedVerifyStepName): string {
  const fileName = BUNDLED_CONFIG_FILES[stepName];
  const primaryPath = join(bundledDir, fileName);
  if (existsSync(primaryPath)) {
    return primaryPath;
  }

  const fallbackPath = join(VERIFY_PACKAGE_ROOT, fileName);
  if (existsSync(fallbackPath)) {
    return fallbackPath;
  }

  throw new Error(`verify: missing bundled config "${fileName}" for step "${stepName}"`);
}

export function resolveDefaultConfigMap(options: ResolveDefaultConfigOptions = {}): ResolvedDefaultConfigMap {
  const bundledDir = resolveBundledConfigDir(options.bundledConfigDir);

  return {
    eslint: {
      stepName: 'eslint',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'eslint'),
    },
    'eslint-length': {
      stepName: 'eslint-length',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'eslint-length'),
    },
    tsc: {
      stepName: 'tsc',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'tsc'),
    },
    knip: {
      stepName: 'knip',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'knip'),
    },
    jscpd: {
      stepName: 'jscpd',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'jscpd'),
    },
    'ast-grep': {
      stepName: 'ast-grep',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'ast-grep'),
    },
    'duplicate-shapes': {
      stepName: 'duplicate-shapes',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'duplicate-shapes'),
    },
    depcruise: {
      stepName: 'depcruise',
      source: 'bundled',
      configPath: resolveBundledConfigPath(bundledDir, 'depcruise'),
    },
  };
}
