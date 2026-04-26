import { homedir } from 'node:os';
import { join } from 'node:path';

export const RUNTIME_PACKAGE_NAME = 'agent-quality-gate';

export function resolveCacheRoot(explicitCacheDir?: string): string {
  if (explicitCacheDir) {
    return explicitCacheDir;
  }
  if (process.env.AGENT_QUALITY_GATE_CACHE_DIR) {
    return process.env.AGENT_QUALITY_GATE_CACHE_DIR;
  }
  const xdgCacheHome = process.env.XDG_CACHE_HOME;
  if (xdgCacheHome) {
    return join(xdgCacheHome, RUNTIME_PACKAGE_NAME);
  }
  return join(homedir(), '.cache', RUNTIME_PACKAGE_NAME);
}

export function toRuntimeDir(cacheRoot: string, version: string): string {
  return join(cacheRoot, 'runtimes', `v${version}`);
}

export function toRuntimeVerifyBin(runtimeDir: string): string {
  return join(runtimeDir, 'node_modules', RUNTIME_PACKAGE_NAME, 'dist', 'bin', 'verify.js');
}
