async function runNodeProcess(options: {
  name: string;
  args: string[];
  cwd?: string;
  environment?: Record<string, string>;
  timeoutMs?: number;
  timeoutMessage?: string;
  failurePrefix: string;
}): Promise<{ exitCode: number }> {
  await Promise.resolve();
  void options;
  return { exitCode: 0 };
}

const HINT = 'timed out';

async function runTool(
  name: string,
  args: string[],
  environment?: Record<string, string>,
  cwd?: string,
  timeoutMs?: number,
): Promise<{ exitCode: number }> {
  return await runNodeProcess({
    name,
    args,
    cwd,
    environment,
    timeoutMs,
    timeoutMessage: timeoutMs === undefined ? undefined : HINT,
    failurePrefix: 'verify: failed to start ',
  });
}

export async function run(value: string): Promise<{ exitCode: number }> {
  return await runTool(value, [], undefined, undefined, undefined);
}
