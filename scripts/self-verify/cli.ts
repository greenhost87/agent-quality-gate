import type { VerifyRequest } from '../../gate/execute-verify/execute-verify.js';

const LOCAL_ENTRIES = [
  'adapters/claude/*.ts',
  'adapters/codex/*.ts',
  'adapters/cursor/*.ts',
  'adapters/mcp/*.ts',
  'adapters/pi/*.ts',
  'adapters/hooks/*.ts',
  'presets/baseline/oxlint/*.ts',
  'presets/baseline/oxlint/rules/*.ts',
  'presets/baseline/gate-config.ts',
  'scripts/*/*.ts',
  'config/*/*.ts',
  'gate/*/*.ts',
  'preset-catalog/*/*.ts',
  'process/*/*.ts',
  'install.ts',
] as const;

const LOCAL_PRESETS = [
  'bun-parse',
  'config',
  'database',
  'module-placement',
  'playwright',
] as const;

const LOCAL_MODULE_PLACEMENT = {
  directories: ['presets/baseline/tests', 'scripts', 'gate', 'config', 'preset-catalog', 'process'],
  rootExceptions: {},
} as const;

const LOCAL_IGNORE_PATTERNS = [
  'adapters/claude/.quality-fixtures/**',
  'gate/tests/**/fixtures/**',
  'adapters/codex/.quality-fixtures/**',
  'adapters/cursor/.quality-fixtures/**',
  'adapters/pi/.quality-fixtures/**',
  'assets/oxlint.config.ts',
  'scripts/tests/.quality-fixtures/**',
  'gate/.quality-fixtures/**',
  'presets/*/.quality-fixtures/**',
] as const;

export function localVerifyRequest(): VerifyRequest {
  return {
    projectRoot: process.cwd(),
    entries: LOCAL_ENTRIES,
    ignorePatterns: LOCAL_IGNORE_PATTERNS,
    presets: LOCAL_PRESETS,
    skipPresetProjectChecks: true,
    presetConfig: {
      'module-placement': {
        directories: [...LOCAL_MODULE_PLACEMENT.directories],
        rootExceptions: { ...LOCAL_MODULE_PLACEMENT.rootExceptions },
      },
      baseline: { maxInlineParameterObjectMembers: 3 },
    },
    fallowIgnoreDependencies: ['@testcontainers/postgresql', 'testcontainers', '@oxlint/plugins'],
    okLabel: 'repository',
  };
}
