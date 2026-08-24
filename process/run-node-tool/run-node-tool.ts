import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { file, spawn } from 'bun';

import type {
  NodeProcessRunOptions,
  NodeProcessToFileOptions,
  ToolRunResult,
} from '../../gate/execute-verify/execute-verify.types.js';
import { createEnv } from '../../gate/read-env/read-env.js';
import { readTextFile } from '../files/files.js';
import { runCapturedProcess } from '../run-command/run-command.js';

export async function runNodeProcess(options: NodeProcessRunOptions): Promise<ToolRunResult> {
  const result = await runCapturedProcess({
    command: process.execPath,
    args: options.args,
    cwd: options.cwd,
    environment: options.environment,
    timeoutMs: options.timeoutMs,
    timeoutMessage: options.timeoutMessage,
  });
  if (result.error !== undefined) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${options.failurePrefix}${options.name}: ${result.error.message}\n`,
    };
  }
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

export async function runNodeProcessToFile(
  options: NodeProcessToFileOptions,
): Promise<ToolRunResult> {
  mkdirSync(dirname(options.outputPath), { recursive: true });
  try {
    const child = spawn({
      cmd: [process.execPath, ...options.args],
      cwd: options.cwd,
      env: createEnv(options.environment),
      stdin: 'ignore',
      stdout: file(options.outputPath),
      stderr: 'pipe',
    });
    const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    try {
      return {
        exitCode,
        stdout: await readTextFile(options.outputPath),
        stderr,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        exitCode: 1,
        stdout: '',
        stderr: `${options.failurePrefix}failed to read ${options.name} output: ${message}\n${stderr}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${options.failurePrefix}failed to start ${options.name}: ${message}\n`,
    };
  }
}
