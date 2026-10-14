import type { VerifyRequest } from '#system/gate/run/execute-verify.js';

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
  'system/scripts/*/*.ts',
  'system/config/*/*.ts',
  'system/gate/*/*.ts',
  'system/presets/*.ts',
  'system/process/*/*.ts',
  'system/oxlint/rule-bench/*.ts',
  'system/install/**/*.ts',
  'shared/tests/oxlint.ts',
  'shared/verify.ts',
] as const;

const LOCAL_PRESETS = ['bun-parse', 'config', 'database', 'layout', 'playwright'] as const;

const LOCAL_MODULE_PLACEMENT = {
  directories: [
    'presets/baseline/tests',
    'system/scripts',
    'system/gate',
    'system/config',
    'system/presets',
    'system/process',
  ],
  maxDepth: {
    'system/gate': 2,
  },
  rootExceptions: {
    'system/config': ['agent-quality-gate-home.ts', 'project-artifacts.ts'],
    'system/presets': [
      'load-preset-check.ts',
      'load-preset-gate-config.ts',
      'parse-preset-manifest.ts',
      'preset-catalog.ts',
      'preset-contract.types.ts',
      'read-project-package-json.ts',
      'reconcile-preset-files.ts',
      'verify-preset-dependencies.ts',
      'write-oxlint-config.ts',
    ],
  },
} as const;

const LOCAL_IGNORE_PATTERNS = [
  'adapters/claude/tests/.quality-fixtures/**',
  'system/tests/gate/**/fixtures/**',
  'adapters/codex/tests/.quality-fixtures/**',
  'adapters/cursor/tests/.quality-fixtures/**',
  'adapters/pi/tests/.quality-fixtures/**',
  'system/configs/oxlint.config.ts',
  'system/tests/scripts/.quality-fixtures/**',
  'system/tests/**',
  'system/tests/gate/.quality-fixtures/**',
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
      layout: {
        placement: {
          directories: [...LOCAL_MODULE_PLACEMENT.directories],
          rootExceptions: { ...LOCAL_MODULE_PLACEMENT.rootExceptions },
          maxDepth: { ...LOCAL_MODULE_PLACEMENT.maxDepth },
        },
        testColocation: { policy: 'aqg-repository' },
      },
      baseline: { maxInlineParameterObjectMembers: 3 },
    },
    fallowIgnoreDependencies: ['@testcontainers/postgresql', 'testcontainers', '@oxlint/plugins'],
    okLabel: 'repository',
  };
}
