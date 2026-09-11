import { afterEach, describe, expect, it } from 'bun:test';

import { getOptionalEnv, setEnv } from '../../../gate/read-env/read-env.js';
import { isBunTestParallelEnabled, resolveBunTestParallelArgs } from '../bun-test-parallel.js';
import { resolvePresetTestArgs } from '../run-preset-tests.js';
import { resolveBunTestTimeoutMs } from '../bun-test-timeout.js';

const ENV_KEYS = ['AQG_TEST_PARALLEL'] as const;

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

describe('bun-test-parallel', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('enables parallel by default', () => {
    snapshotEnv();
    setEnv('AQG_TEST_PARALLEL', undefined);
    expect(isBunTestParallelEnabled()).toBe(true);
    expect(resolveBunTestParallelArgs()).toEqual(['--parallel']);
  });

  it('disables parallel when AQG_TEST_PARALLEL=0', () => {
    snapshotEnv();
    setEnv('AQG_TEST_PARALLEL', '0');
    expect(isBunTestParallelEnabled()).toBe(false);
    expect(resolveBunTestParallelArgs()).toEqual([]);
    expect(resolvePresetTestArgs(['tests'])).toEqual([
      'test',
      '--timeout',
      String(resolveBunTestTimeoutMs()),
      'tests',
    ]);
  });

  it('keeps parallel for other values', () => {
    snapshotEnv();
    setEnv('AQG_TEST_PARALLEL', '1');
    expect(isBunTestParallelEnabled()).toBe(true);
    expect(resolveBunTestParallelArgs()).toEqual(['--parallel']);
    expect(resolvePresetTestArgs(['tests'])).toEqual([
      'test',
      '--parallel',
      '--timeout',
      String(resolveBunTestTimeoutMs()),
      'tests',
    ]);
  });
});
