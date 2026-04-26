export interface InitCliOptions {
  argv?: readonly string[];
  cwd?: string;
}

export interface ParsedArgs {
  cacheDir?: string;
  force: boolean;
  help: boolean;
  runtimeSource?: string;
  version?: string;
}

export interface PackageJsonShape {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  agentQualityGate?: {
    version?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ToolPackage {
  name: string;
  root: string;
  version: string;
}

export interface UnknownJsonObject {
  [key: string]: unknown;
}

export interface StringMap {
  [key: string]: string;
}
