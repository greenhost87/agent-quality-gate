import { runCapturedProcess } from '#system/process/run-command/run-command.js';

export async function runTestCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const result = await runCapturedProcess({ command, args, cwd });
  if (result.error !== undefined) throw result.error;
  return { exitCode: result.exitCode, stderr: result.stderr, stdout: result.stdout };
}
