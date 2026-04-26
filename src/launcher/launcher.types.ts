export interface LauncherCliOptions {
  argv?: readonly string[];
  cwd?: string;
}

export interface PackageJsonShape {
  agentQualityGate?: {
    version?: string;
  };
}

export interface UnknownJsonObject {
  [key: string]: unknown;
}
