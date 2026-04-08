export type BuiltinVerifyStepName =
  | 'eslint'
  | 'remark'
  | 'tsc'
  | 'knip'
  | 'jscpd'
  | 'ast-grep'
  | 'duplicate-shapes'
  | 'depcruise';

export interface VerifyStep {
  name: string;
  command: string;
  args: string[];
}

export interface VerifyResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

export interface VerifyStepFailure {
  code: number;
  stderr: string;
}

export type VerifyErrorMode = 'first' | 'all';

export interface RunVerifyOptions {
  errorMode?: VerifyErrorMode;
}

export interface StepOverride {
  configPath?: string;
  args?: string[];
  targets?: string[];
}

export type VerifyStepOverride = false | StepOverride;

export interface VerifyOverrides {
  eslint?: VerifyStepOverride;
  remark?: VerifyStepOverride;
  tsc?: VerifyStepOverride;
  knip?: VerifyStepOverride;
  jscpd?: VerifyStepOverride;
  'ast-grep'?: VerifyStepOverride;
  'duplicate-shapes'?: VerifyStepOverride;
  depcruise?: VerifyStepOverride;
}

export interface VerifyConfig {
  steps?: VerifyStep[];
  overrides?: VerifyOverrides;
}

export type VerifyConfigSource = 'bundled' | 'local' | 'override' | 'custom';

export interface VerifyStepDebugInfo {
  name: string;
  configPath?: string;
  source: VerifyConfigSource;
}

export interface ResolvedVerifyPlan {
  steps: VerifyStep[];
  stepDebugInfo: VerifyStepDebugInfo[];
  configFilePath?: string;
}

export interface LoadVerifyConfigOptions {
  configPath?: string;
  cwd?: string;
}

export interface DefaultVerifyStepsOptions {
  cwd?: string;
  overrides?: VerifyOverrides;
}

export interface DefaultVerifyStepsResult {
  steps: VerifyStep[];
  stepDebugInfo: VerifyStepDebugInfo[];
}

export type DefaultConfigSource = 'bundled';

export interface ResolvedDefaultConfig {
  stepName: BuiltinVerifyStepName;
  source: DefaultConfigSource;
  configPath: string;
}

export type ResolvedDefaultConfigMap = Record<BuiltinVerifyStepName, ResolvedDefaultConfig>;

export interface ResolveDefaultConfigOptions {
  cwd?: string;
  bundledConfigDir?: string;
}
