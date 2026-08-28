import { spawn, spawnSync } from 'bun';

import { createEnv } from '../../gate/read-env/read-env.js';
import type { ProcessEnv } from '../../gate/read-env/read-env.js';

function failureResult(error: Error): CapturedProcessResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: '',
    error,
  };
}

function killProcessTree(pid: number): void {
  spawnSync({
    cmd: ['pkill', '-KILL', '-P', String(pid)],
    stdout: 'ignore',
    stderr: 'ignore',
  });
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already exited
  }
}

async function waitForProcessExit(
  pid: number,
  exited: Promise<number>,
  timeoutMs: number | undefined,
): Promise<number | 'timeout'> {
  if (timeoutMs === undefined) {
    return exited;
  }
  const timeoutHit = Promise.withResolvers<'timeout'>();
  const timer = setTimeout(() => {
    killProcessTree(pid);
    timeoutHit.resolve('timeout');
  }, timeoutMs);
  try {
    return await Promise.race([exited, timeoutHit.promise]);
  } finally {
    clearTimeout(timer);
  }
}

async function inheritedProcessResult(
  pid: number,
  exited: Promise<number>,
  options: CapturedProcessOptions,
): Promise<CapturedProcessResult> {
  const outcome = await waitForProcessExit(pid, exited, options.timeoutMs);
  if (outcome !== 'timeout') {
    return { exitCode: outcome, stdout: '', stderr: '', error: undefined };
  }
  await exited;
  const timeoutLine =
    options.timeoutMessage ?? `command exceeded ${String(options.timeoutMs)}ms and was killed`;
  return { exitCode: 1, stdout: '', stderr: `${timeoutLine}\n`, error: undefined };
}

export async function runCapturedProcess(
  options: CapturedProcessOptions,
): Promise<CapturedProcessResult> {
  try {
    const inherit = options.inheritOutput === true;
    const child = spawn({
      cmd: [options.command, ...(options.args ?? [])],
      cwd: options.cwd,
      env: createEnv(options.environment ?? {}),
      stdin: options.stdin ?? (inherit ? 'inherit' : 'ignore'),
      stdout: inherit ? 'inherit' : 'pipe',
      stderr: inherit ? 'inherit' : 'pipe',
    });
    if (inherit) {
      return await inheritedProcessResult(child.pid, child.exited, options);
    }
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();
    const timeoutMs = options.timeoutMs;
    if (timeoutMs === undefined) {
      const [stdout, stderr, exitCode] = await Promise.all([
        stdoutPromise,
        stderrPromise,
        child.exited,
      ]);
      return { exitCode, stdout, stderr, error: undefined };
    }

    const outcome = await waitForProcessExit(child.pid, child.exited, timeoutMs);
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    if (outcome === 'timeout') {
      await child.exited;
      const timeoutLine =
        options.timeoutMessage ?? `command exceeded ${String(timeoutMs)}ms and was killed`;
      return {
        exitCode: 1,
        stdout,
        stderr: stderr.length > 0 ? `${timeoutLine}\n${stderr}` : `${timeoutLine}\n`,
        error: undefined,
      };
    }
    return { exitCode: outcome, stdout, stderr, error: undefined };
  } catch (error) {
    return failureResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export function runCapturedProcessSync(options: CapturedProcessOptions): CapturedProcessResult {
  try {
    const inherit = options.inheritOutput === true;
    const result = spawnSync({
      cmd: [options.command, ...(options.args ?? [])],
      cwd: options.cwd,
      env: createEnv(options.environment ?? {}),
      stdin: options.stdin ?? (inherit ? 'inherit' : 'ignore'),
      stdout: inherit ? 'inherit' : 'pipe',
      stderr: inherit ? 'inherit' : 'pipe',
    });
    return {
      exitCode: result.exitCode,
      stdout: inherit ? '' : (result.stdout?.toString() ?? ''),
      stderr: inherit ? '' : (result.stderr?.toString() ?? ''),
      error: undefined,
    };
  } catch (error) {
    return failureResult(error instanceof Error ? error : new Error(String(error)));
  }
}

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
