import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VERIFY_BIN_PATH = fileURLToPath(new URL('../../bin/verify.ts', import.meta.url));
const SLOW_CLI_TIMEOUT_MS = 20_000;

interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

function runVerifyCli(args: string[]): CommandResult {
  const result = spawnSync('bun', [VERIFY_BIN_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  return {
    code: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

describe('verify cli e2e', () => {
  it('prints help that includes the timings flag', () => {
    const result = runVerifyCli(['--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('verify --timings');
    expect(result.stdout).toContain('verify --all-errors --timings');
    expect(result.stderr).toBe('');
  });

  it(
    'prints per-step timings when the timings flag is enabled',
    () => {
      const result = runVerifyCli(['--timings']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('verify: ok');
      expect(result.stdout).toContain('protected-coverage take ');
      expect(result.stdout).toContain('eslint take ');
      expect(result.stdout).toContain('remark take ');
      expect(result.stdout).toContain('Total ');
      expect(result.stderr).toBe('');
    },
    SLOW_CLI_TIMEOUT_MS
  );
});
