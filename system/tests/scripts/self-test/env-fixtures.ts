import { getOptionalEnv, setEnv } from '#system/gate/read-env/read-env.ts';

export function snapshotEnv(
  keys: readonly string[],
  originalEnv: Map<string, string | undefined>,
): void {
  for (const key of keys) {
    originalEnv.set(key, getOptionalEnv(key));
  }
}

export function restoreEnv(
  keys: readonly string[],
  originalEnv: Map<string, string | undefined>,
): void {
  for (const key of keys) {
    setEnv(key, originalEnv.get(key));
  }
}
