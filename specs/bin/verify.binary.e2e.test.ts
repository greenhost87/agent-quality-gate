import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'bun:test';

import { executableExtension } from '../../src/runtime/paths.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RELEASE_PACKAGE_JSON_PATH = join(REPO_ROOT, '.tmp', 'release-package', 'package.json');
const VERIFY_BIN_PATH = join(REPO_ROOT, '.tmp', 'release-package', 'dist', 'bin', `verify${executableExtension()}`);
const SLOW_BINARY_TIMEOUT_MS = 30_000;

interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function runVerifyBinary(args: string[]): CommandResult {
  const result = spawnSync(VERIFY_BIN_PATH, args, {
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

describe('verify release binary e2e', () => {
  beforeAll(() => {
    const result = spawnSync('bun', ['run', 'build:release'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    if ((result.status ?? 1) !== 0) {
      throw new Error(
        [
          `release build failed with status ${result.status ?? 'null'}`,
          `stdout:\n${result.stdout ?? ''}`,
          `stderr:\n${result.stderr ?? ''}`,
        ].join('\n')
      );
    }
  }, SLOW_BINARY_TIMEOUT_MS);

  it('prints help that includes the timings flag', () => {
    const result = runVerifyBinary(['--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('verify --timings');
    expect(result.stdout).toContain('verify --all-errors --timings');
    expect(result.stderr).toBe('');
  });

  it('packages the standalone binary without runtime engine metadata', () => {
    const packageJson: unknown = JSON.parse(readFileSync(RELEASE_PACKAGE_JSON_PATH, 'utf-8'));

    expect(isRecord(packageJson)).toBe(true);
    if (!isRecord(packageJson)) {
      throw new Error('release package.json must be an object');
    }

    expect(packageJson.bin).toEqual({ verify: `./dist/bin/verify${executableExtension()}` });
    expect(packageJson).not.toHaveProperty('dependencies');
    expect(packageJson).not.toHaveProperty('devDependencies');
    expect(packageJson).not.toHaveProperty('engines');
  });

  it(
    'prints per-step timings when the timings flag is enabled',
    () => {
      const result = runVerifyBinary(['--timings']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('verify: ok');
      expect(result.stdout).toContain('protected-coverage take ');
      expect(result.stdout).toContain('eslint take ');
      expect(result.stdout).toContain('markdown-headings take ');
      expect(result.stdout).toContain('Total ');
      expect(result.stderr).toBe('');
    },
    SLOW_BINARY_TIMEOUT_MS
  );
});
