import { runCapturedProcessSync } from '../../process/run-command/run-command.js';
import type { VerifyResult } from '../../gate/execute-verify/execute-verify.js';

export const CONTAINER_RUNTIME_UNAVAILABLE_MESSAGE =
  'pack integration requires a running container runtime: start Docker Desktop or Colima, confirm with `docker ps`, then rerun';

/** True when a Docker-compatible daemon responds (database pack integration needs this). */
export function isContainerRuntimeAvailable(): boolean {
  const result = runCapturedProcessSync({
    command: 'docker',
    args: ['ps', '-q'],
    cwd: process.cwd(),
  });
  if (result.error !== undefined) {
    return false;
  }
  return result.exitCode === 0;
}

export function containerRuntimeUnavailableResult(): VerifyResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: `test: ${CONTAINER_RUNTIME_UNAVAILABLE_MESSAGE}\n`,
  };
}

export function requireContainerRuntime(): void {
  if (!isContainerRuntimeAvailable()) {
    throw new Error(CONTAINER_RUNTIME_UNAVAILABLE_MESSAGE);
  }
}
