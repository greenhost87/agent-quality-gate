import { afterEach, describe, expect, it } from 'bun:test';

import { setEnv } from '#system/gate/read-env/read-env.ts';
import { restoreEnv, snapshotEnv } from './env-fixtures.js';
import {
  isSlowCiRunner,
  resolveBunTestTimeoutMs,
} from '#system/scripts/self-test/bun-test-timeout.ts';
import {
  DEFAULT_BUN_TEST_TIMEOUT_MS,
  SLOW_CI_BUN_TEST_TIMEOUT_MS,
} from '#system/config/tuning/tuning.ts';

const ENV_KEYS = ['AQG_TEST_TIMEOUT_MS', 'CI', 'RUNNER_OS'] as const;

const originalEnv = new Map<string, string | undefined>();

function setSlowCiEnvironment(timeout: string | undefined): void {
  setEnv('AQG_TEST_TIMEOUT_MS', timeout);
  setEnv('CI', 'true');
  setEnv('RUNNER_OS', 'macOS');
}

describe('resolveBunTestTimeoutMs', () => {
  afterEach(() => {
    restoreEnv(ENV_KEYS, originalEnv);
  });

  it('defaults to 30s outside slow CI', () => {
    snapshotEnv(ENV_KEYS, originalEnv);
    setEnv('AQG_TEST_TIMEOUT_MS', undefined);
    setEnv('CI', undefined);
    setEnv('RUNNER_OS', undefined);
    expect(resolveBunTestTimeoutMs()).toBe(DEFAULT_BUN_TEST_TIMEOUT_MS);
  });

  it('uses AQG_TEST_TIMEOUT_MS when set', () => {
    snapshotEnv(ENV_KEYS, originalEnv);
    setEnv('AQG_TEST_TIMEOUT_MS', '45000');
    expect(resolveBunTestTimeoutMs()).toBe(45_000);
  });

  it('uses 120s on GitHub Actions macOS runners', () => {
    snapshotEnv(ENV_KEYS, originalEnv);
    setSlowCiEnvironment(undefined);
    expect(isSlowCiRunner()).toBe(true);
    expect(resolveBunTestTimeoutMs()).toBe(SLOW_CI_BUN_TEST_TIMEOUT_MS);
  });

  it('prefers AQG_TEST_TIMEOUT_MS over slow CI detection', () => {
    snapshotEnv(ENV_KEYS, originalEnv);
    setSlowCiEnvironment('120000');
    expect(resolveBunTestTimeoutMs()).toBe(120_000);
  });
});
