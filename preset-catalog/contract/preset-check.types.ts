import type { ToolRunResult } from '../../gate/execute-verify/execute-verify.js';

export type PresetVerifyContext = {
  projectRoot: string;
  entries: readonly string[];
  ignorePatterns: readonly string[];
  fallowConfigPath: string;
};

export type PresetCheckModule = {
  preflight?: (
    projectRoot: string,
  ) => ToolRunResult | undefined | Promise<ToolRunResult | undefined>;
  runToolChecks?: (context: PresetVerifyContext) => Promise<ToolRunResult[]>;
};

export const PRESET_CHECK_MODULE_BASENAMES = ['check.js', 'check.ts'] as const;
