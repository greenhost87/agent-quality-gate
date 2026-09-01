import { afterEach, describe, expect, it } from 'bun:test';

import { getOptionalEnv, setEnv } from '../../../gate/read-env/read-env.js';
import {
  DEFAULT_BUN_TEST_TIMEOUT_MS,
  isSlowCiRunner,
  resolveBunTestTimeoutMs,
  SLOW_CI_BUN_TEST_TIMEOUT_MS,
} from '../bun-test-timeout.js';

const ENV_KEYS = ['AQG_TEST_TIMEOUT_MS', 'CI', 'RUNNER_OS'] as const;

const originalEnv = new Map<string, string | undefined>();

function snapshotEnv(): void {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, getOptionalEnv(key));
  }
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    setEnv(key, originalEnv.get(key));
  }
}

describe('resolveBunTestTimeoutMs', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('defaults to 30s outside slow CI', () => {
    snapshotEnv();
    setEnv('AQG_TEST_TIMEOUT_MS', undefined);
    setEnv('CI', undefined);
    setEnv('RUNNER_OS', undefined);
    expect(resolveBunTestTimeoutMs()).toBe(DEFAULT_BUN_TEST_TIMEOUT_MS);
  });

  it('uses AQG_TEST_TIMEOUT_MS when set', () => {
    snapshotEnv();
    setEnv('AQG_TEST_TIMEOUT_MS', '45000');
    expect(resolveBunTestTimeoutMs()).toBe(45_000);
  });

  it('uses 120s on GitHub Actions macOS runners', () => {
    snapshotEnv();
    setEnv('AQG_TEST_TIMEOUT_MS', undefined);
    setEnv('CI', 'true');
    setEnv('RUNNER_OS', 'macOS');
    expect(isSlowCiRunner()).toBe(true);
    expect(resolveBunTestTimeoutMs()).toBe(SLOW_CI_BUN_TEST_TIMEOUT_MS);
  });

  it('prefers AQG_TEST_TIMEOUT_MS over slow CI detection', () => {
    snapshotEnv();
    setEnv('AQG_TEST_TIMEOUT_MS', '120000');
    setEnv('CI', 'true');
    setEnv('RUNNER_OS', 'macOS');
    expect(resolveBunTestTimeoutMs()).toBe(120_000);
  });
});
