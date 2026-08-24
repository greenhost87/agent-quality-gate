import type {
  VerifyRequest,
  VerifyResult,
} from '../../gate/execute-verify/execute-verify.types.js';
import { firstNonZeroResult } from './preset-verify-result.js';

const LOCAL_ENTRIES = [
  'adapters/claude/*.ts',
  'adapters/codex/*.ts',
  'adapters/cursor/*.ts',
  'adapters/mcp/*.ts',
  'adapters/pi/*.ts',
  'adapters/hooks/*.ts',
  'presets/baseline/oxlint/*.ts',
  'presets/baseline/oxlint/rules/*.ts',
  'presets/playwright/check.ts',
  'scripts/*/*.ts',
  'config/*/*.ts',
  'gate/*/*.ts',
  'preset-catalog/*/*.ts',
  'process/*/*.ts',
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
  'adapters/codex/.quality-fixtures/**',
  'adapters/cursor/.quality-fixtures/**',
  'adapters/pi/.quality-fixtures/**',
  'assets/oxlint.config.ts',
  'scripts/tests/.quality-fixtures/**',
  'gate/.quality-fixtures/**',
  'presets/baseline/.quality-fixtures/**',
  'presets/bun-parse/.quality-fixtures/**',
  'presets/config/.quality-fixtures/**',
  'presets/database/.quality-fixtures/**',
  'presets/module-placement/.quality-fixtures/**',
  'presets/playwright/.quality-fixtures/**',
] as const;

export function localVerifyRequest(): VerifyRequest {
  return {
    projectRoot: process.cwd(),
    entries: LOCAL_ENTRIES,
    ignorePatterns: LOCAL_IGNORE_PATTERNS,
    presets: LOCAL_PRESETS,
    skipPresetProjectChecks: true,
    modulePlacement: {
      directories: [...LOCAL_MODULE_PLACEMENT.directories],
      rootExceptions: { ...LOCAL_MODULE_PLACEMENT.rootExceptions },
    },
    baseline: { maxInlineParameterObjectMembers: 3 },
    fallowIgnoreDependencies: ['@testcontainers/postgresql', 'testcontainers'],
    okLabel: 'repository',
  };
}

export function writeVerifyStreams(result: VerifyResult): void {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
}

export function exitCodeAfterWritingResults(...results: readonly VerifyResult[]): number {
  for (const result of results) {
    writeVerifyStreams(result);
  }
  return firstNonZeroResult(...results)?.exitCode ?? 0;
}
