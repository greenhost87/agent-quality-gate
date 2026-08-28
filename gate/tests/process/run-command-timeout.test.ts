import { describe, expect, it } from 'bun:test';

import {
  runCapturedProcess,
  runCapturedProcessSync,
} from '../../../process/run-command/run-command.js';

describe('runCapturedProcess timeout', () => {
  it('kills a hung process and returns the timeout message', async () => {
    const started = performance.now();
    const result = await runCapturedProcess({
      command: 'sleep',
      args: ['30'],
      timeoutMs: 200,
      timeoutMessage: 'timed out',
    });
    expect(performance.now() - started).toBeLessThan(5000);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.stderr.includes('timed out')).toBe(true);
  });

  it('kills a hung process when output is inherited', async () => {
    const result = await runCapturedProcess({
      command: 'bun',
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      inheritOutput: true,
      timeoutMs: 50,
      timeoutMessage: 'inherited command timed out',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('inherited command timed out');
  });
});

describe('runCapturedProcessSync inheritOutput', () => {
  it('streams child stdout to the parent and returns empty captured buffers', () => {
    const result = runCapturedProcessSync({
      command: 'bun',
      args: ['-e', 'process.stdout.write("inherit-ok\\n")'],
      inheritOutput: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.error).toBeUndefined();
  });
});
