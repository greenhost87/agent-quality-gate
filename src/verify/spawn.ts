import { spawn } from 'node:child_process';

import type { SpawnResult } from './types.js';

export async function spawnCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  inheritOutput: boolean,
  environment?: {
    [name: string]: string;
  }
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: { ...process.env, ...environment },
      stdio: inheritOutput ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}
