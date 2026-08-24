import type { ProcessEnv } from '../../gate/read-env/read-env.types.js';

export type CapturedProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  error: Error | undefined;
};

export type CapturedProcessOptions = {
  command: string;
  args?: readonly string[];
  cwd?: string;
  environment?: ProcessEnv;
  stdin?: 'ignore' | 'inherit';
  inheritOutput?: boolean;
  timeoutMs?: number;
  timeoutMessage?: string;
};
