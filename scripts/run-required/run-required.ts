import { runCapturedProcessSync } from '../../process/run-command/run-command.js';

export function runRequired(
  command: string,
  args: readonly string[],
  cwd: string,
  inheritOutput: boolean,
): void {
  const result = runCapturedProcessSync({
    command,
    args,
    cwd,
    inheritOutput,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr || result.stdout || `${command} exited with code ${String(result.exitCode)}`,
    );
  }
}
