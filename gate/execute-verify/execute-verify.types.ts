import type {
  BaselineConfig,
  ModulePlacementConfig,
  PackageBoundariesConfig,
} from '../../config/global-config/global-config.js';

export type ToolRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type NodeProcessRunOptions = {
  name: string;
  args: readonly string[];
  cwd?: string;
  environment?: Record<string, string>;
  failurePrefix: string;
  timeoutMs?: number;
  timeoutMessage?: string;
};

export type NodeProcessToFileOptions = {
  name: string;
  args: readonly string[];
  cwd: string;
  environment: Record<string, string>;
  outputPath: string;
  failurePrefix: string;
};

export type ToolRunner = (options: NodeProcessRunOptions) => Promise<ToolRunResult>;

export type VerifyRequest = {
  projectRoot: string;
  entries: readonly string[];
  presets?: readonly string[];
  ignorePatterns?: readonly string[];
  fallowIgnoreDependencies?: readonly string[];
  packageBoundaries?: PackageBoundariesConfig;
  modulePlacement?: ModulePlacementConfig;
  baseline?: BaselineConfig;
  /** Skip dependency, managed-file, and preset check-module work; only merge oxlint policy and run tools. */
  skipPresetProjectChecks?: boolean;
  /** Drop these oxlint rule ids from agent-format diagnostics before deciding pass/fail. */
  ignoreOxlintRuleIds?: readonly string[];
  /** Label after `verify: ok` on success (duration is appended by executeVerify). */
  okLabel?: string;
};

export type VerifyResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type PhaseTimings = {
  cyclesMs: number;
  parallelMs?: number;
  oxlintMs?: number;
  skipHealthMs?: number;
  complexityMs?: number;
  presetsMs?: number;
};

export type ExecuteVerifyOutcome = {
  result: VerifyResult;
  timings?: PhaseTimings;
};

export type TimedToolRun = {
  result: ToolRunResult;
  ms: number;
};
