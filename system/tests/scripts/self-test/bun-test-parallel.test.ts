import { afterEach, describe, expect, it } from 'bun:test';

import { setEnv } from '#system/gate/read-env/read-env.ts';
import { restoreEnv, snapshotEnv } from './env-fixtures.js';
import {
  isBunTestParallelEnabled,
  resolveBunTestParallelArgs,
} from '#system/scripts/self-test/bun-test-parallel.ts';
import { resolvePresetTestArgs } from '#system/scripts/self-test/run-preset-tests.ts';
import { resolveBunTestTimeoutMs } from '#system/scripts/self-test/bun-test-timeout.ts';

const ENV_KEYS = ['AQG_TEST_PARALLEL'] as const;

const originalEnv = new Map<string, string | undefined>();

describe('bun-test-parallel', () => {
  afterEach(() => {
    restoreEnv(ENV_KEYS, originalEnv);
  });

  it('enables parallel by default', () => {
    snapshotEnv(ENV_KEYS, originalEnv);
    setEnv('AQG_TEST_PARALLEL', undefined);
    expect(isBunTestParallelEnabled()).toBe(true);
    expect(resolveBunTestParallelArgs()).toEqual(['--parallel']);
  });

  it('disables parallel when AQG_TEST_PARALLEL=0', () => {
    snapshotEnv(ENV_KEYS, originalEnv);
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
    snapshotEnv(ENV_KEYS, originalEnv);
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
