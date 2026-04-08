import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { createDefaultVerifyStepsResult } from './default-steps.js';
import type { LoadVerifyConfigOptions, ResolvedVerifyPlan, VerifyConfig, VerifyStep } from './types.js';

const DEFAULT_CONFIG_FILE_NAMES = [
  'verify.config.ts',
  'verify.config.mts',
  'verify.config.js',
  'verify.config.mjs',
  'verify.config.cjs',
  'verify.config.json',
] as const;

function resolveConfigPath(options: LoadVerifyConfigOptions): string | null {
  const cwd = options.cwd ?? process.cwd();
  if (options.configPath) {
    return isAbsolute(options.configPath) ? options.configPath : join(cwd, options.configPath);
  }
  for (const fileName of DEFAULT_CONFIG_FILE_NAMES) {
    const candidate = join(cwd, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function loadVerifyConfigWithPath(options: LoadVerifyConfigOptions = {}): Promise<null> {
  const resolvedPath = resolveConfigPath(options);
  if (resolvedPath) {
    throw new Error(`verify: local verify config is not allowed in locked mode: ${resolvedPath}`);
  }
  return null;
}

export async function loadVerifyConfig(options: LoadVerifyConfigOptions = {}): Promise<VerifyConfig | null> {
  await loadVerifyConfigWithPath(options);
  return null;
}

export async function resolveVerifyPlan(options: LoadVerifyConfigOptions = {}): Promise<ResolvedVerifyPlan> {
  await loadVerifyConfigWithPath(options);
  const cwd = options.cwd ?? process.cwd();
  const defaults = createDefaultVerifyStepsResult({ cwd });
  return {
    steps: defaults.steps,
    stepDebugInfo: defaults.stepDebugInfo,
  };
}

export async function resolveVerifySteps(options: LoadVerifyConfigOptions = {}): Promise<VerifyStep[]> {
  const plan = await resolveVerifyPlan(options);
  return plan.steps;
}
