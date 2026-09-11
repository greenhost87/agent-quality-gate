import { getOptionalEnv } from '../../gate/read-env/read-env.js';

/** Sequential root tests when `AQG_TEST_PARALLEL=0`; parallel otherwise. */
export function isBunTestParallelEnabled(): boolean {
  return getOptionalEnv('AQG_TEST_PARALLEL') !== '0';
}

export function resolveBunTestParallelArgs(): readonly string[] {
  return isBunTestParallelEnabled() ? ['--parallel'] : [];
}
