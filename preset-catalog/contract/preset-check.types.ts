import type { CheckResult } from '../../gate/execute-verify/check-result.js';

export type PresetVerifyContext = {
  projectRoot: string;
  entries: readonly string[];
  ignorePatterns: readonly string[];
  fallowConfigPath: string;
};

export type PresetCheckModule = {
  preflight?: (
    projectRoot: string,
    presetConfig?: object,
  ) => CheckResult | undefined | Promise<CheckResult | undefined>;
  runToolChecks?: (context: PresetVerifyContext, presetConfig?: object) => Promise<CheckResult[]>;
};

export const PRESET_CHECK_MODULE_BASENAMES = ['check.js', 'check.ts'] as const;
