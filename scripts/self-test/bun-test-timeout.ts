import { getOptionalEnv } from '../../gate/read-env/read-env.js';

export const DEFAULT_BUN_TEST_TIMEOUT_MS = 30_000;
export const SLOW_CI_BUN_TEST_TIMEOUT_MS = 90_000;

export function isSlowCiRunner(): boolean {
  return getOptionalEnv('CI') === 'true' && getOptionalEnv('RUNNER_OS') === 'macOS';
}

export function resolveBunTestTimeoutMs(): number {
  const fromEnv = getOptionalEnv('AQG_TEST_TIMEOUT_MS');
  if (fromEnv !== undefined) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  if (isSlowCiRunner()) {
    return SLOW_CI_BUN_TEST_TIMEOUT_MS;
  }
  return DEFAULT_BUN_TEST_TIMEOUT_MS;
}
