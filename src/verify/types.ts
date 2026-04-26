export type BuiltinVerifyStepName =
  | 'eslint'
  | 'eslint-length'
  | 'markdown-headings'
  | 'tsc'
  | 'knip'
  | 'jscpd'
  | 'ast-grep'
  | 'duplicate-shapes'
  | 'depcruise';

export type ConfigBackedVerifyStepName = Exclude<BuiltinVerifyStepName, 'markdown-headings'>;

export interface VerifyStep {
  name: string;
  command: string;
  args: string[];
}

export interface VerifyResult {
  code: number;
  stdout?: string;
  stderr?: string;
  timings?: VerifyTimings;
}

export interface VerifyStepFailure {
  code: number;
  stderr: string;
}

export type VerifyErrorMode = 'first' | 'all';

export interface RunVerifyOptions {
  errorMode?: VerifyErrorMode;
  collectTimings?: boolean;
}

export interface VerifyStepTiming {
  name: string;
  code: number;
  durationMs: number;
}

export interface VerifyTimings {
  totalMs: number;
  steps: VerifyStepTiming[];
}

export interface VerifyStepRunResult {
  failure: VerifyStepFailure | null;
  timing: VerifyStepTiming;
}

export interface StepOverride {
  configPath?: string;
  args?: string[];
  targets?: string[];
}

export type VerifyStepOverride = false | StepOverride;

export interface VerifyOverrides {
  eslint?: VerifyStepOverride;
  'eslint-length'?: VerifyStepOverride;
  'markdown-headings'?: VerifyStepOverride;
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
  stepName: ConfigBackedVerifyStepName;
  source: DefaultConfigSource;
  configPath: string;
}

export type ResolvedDefaultConfigMap = Record<ConfigBackedVerifyStepName, ResolvedDefaultConfig>;

export interface ResolveDefaultConfigOptions {
  cwd?: string;
  bundledConfigDir?: string;
}
