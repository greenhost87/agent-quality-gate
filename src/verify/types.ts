export type BuiltinVerifyStepName = 'lint-directives' | 'oxlint' | 'fallow';

export interface VerifyStep {
  name: BuiltinVerifyStepName;
  command: string;
  args: string[];
  environment?: {
    [name: string]: string;
  };
}

export interface VerifyResult {
  code: number;
  timings?: VerifyTimings;
}

export interface RunVerifyOptions {
  collectTimings?: boolean;
  cwd?: string;
}

export interface VerifyStepTiming {
  name: BuiltinVerifyStepName;
  code: number;
  durationMs: number;
}

export interface VerifyTimings {
  totalMs: number;
  steps: VerifyStepTiming[];
}

export interface VerifyStepDebugInfo {
  name: BuiltinVerifyStepName;
  configPath?: string;
  source: 'bundled';
}

export interface DefaultVerifyStepsResult {
  steps: VerifyStep[];
  stepDebugInfo: VerifyStepDebugInfo[];
}

export interface EmbeddedConfigPaths {
  fallow: string;
  oxlint: string;
}

export interface CliOptions {
  argv?: readonly string[];
  cwd?: string;
}

export interface ParsedCliArgs {
  help: boolean;
  timings: boolean;
  error?: string;
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
