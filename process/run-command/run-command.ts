import { spawn, spawnSync } from 'bun';

import { createEnv } from '../../gate/read-env/read-env.js';
import type { CapturedProcessOptions, CapturedProcessResult } from './run-command.types.js';

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

export async function runCapturedProcess(
  options: CapturedProcessOptions,
): Promise<CapturedProcessResult> {
  try {
    const child = spawn({
      cmd: [options.command, ...(options.args ?? [])],
      cwd: options.cwd,
      env: createEnv(options.environment ?? {}),
      stdin: options.stdin ?? 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
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

    const timeoutHit = Promise.withResolvers<'timeout'>();
    const timer = setTimeout(() => {
      killProcessTree(child.pid);
      timeoutHit.resolve('timeout');
    }, timeoutMs);
    try {
      const outcome = await Promise.race([
        child.exited.then((exitCode) => ({ kind: 'exit' as const, exitCode })),
        timeoutHit.promise.then(() => ({ kind: 'timeout' as const })),
      ]);
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
      if (outcome.kind === 'timeout') {
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
      return { exitCode: outcome.exitCode, stdout, stderr, error: undefined };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return failureResult(error instanceof Error ? error : new Error(String(error)));
  }
}

export function runCapturedProcessSync(options: CapturedProcessOptions): CapturedProcessResult {
  try {
    const result = spawnSync({
      cmd: [options.command, ...(options.args ?? [])],
      cwd: options.cwd,
      env: createEnv(options.environment ?? {}),
      stdin: options.stdin ?? 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      error: undefined,
    };
  } catch (error) {
    return failureResult(error instanceof Error ? error : new Error(String(error)));
  }
}
