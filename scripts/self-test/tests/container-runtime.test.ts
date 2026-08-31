import { describe, expect, it } from 'bun:test';

import {
  CONTAINER_RUNTIME_UNAVAILABLE_MESSAGE,
  containerRuntimeUnavailableResult,
  isContainerRuntimeAvailable,
} from '../container-runtime.js';

describe('container runtime probe', () => {
  it('returns a boolean', () => {
    expect(typeof isContainerRuntimeAvailable()).toBe('boolean');
  });

  it('reports one actionable integration failure when the runtime is down', () => {
    expect(CONTAINER_RUNTIME_UNAVAILABLE_MESSAGE).toContain('docker ps');
    const result = containerRuntimeUnavailableResult();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`test: ${CONTAINER_RUNTIME_UNAVAILABLE_MESSAGE}\n`);
    expect(result.stdout).toBe('');
  });
});
