import { describe, expect, it } from 'bun:test';

import { runCapturedProcess } from '../../process/run-command/run-command.js';

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
});
