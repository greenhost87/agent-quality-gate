import type { VerifyRequest } from './execute-verify.types.js';

const BASELINE_PRESET_REPOSITORY_ENTRIES = [
  'live-ui-surface/check.ts',
  'live-ui-surface/*.ts',
  'react-duplication/check.ts',
  'react-duplication/*.ts',
] as const;

const BASELINE_PRESET_REPOSITORY_IGNORE_PATTERNS = [
  '**/.quality-fixtures/**',
  '**/tests/**',
  'packages/**',
  'project-quality/**',
  'react-presentation/**',
  'tests/**',
] as const;

const BASELINE_PRESET_REPOSITORY_FALLOW_IGNORE_DEPENDENCIES = ['oxlint-plugin-eslint'] as const;

/** Baseline verify request for optional preset repositories such as aqg-presets. */
export function baselinePresetRepositoryVerifyRequest(projectRoot?: string): VerifyRequest {
  return {
    projectRoot: projectRoot ?? process.cwd(),
    entries: BASELINE_PRESET_REPOSITORY_ENTRIES,
    ignorePatterns: BASELINE_PRESET_REPOSITORY_IGNORE_PATTERNS,
    fallowIgnoreDependencies: BASELINE_PRESET_REPOSITORY_FALLOW_IGNORE_DEPENDENCIES,
    presets: ['bun-parse'],
  };
}
