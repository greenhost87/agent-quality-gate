import { fallowCacheEnvironment } from '#system/gate/preflight/fallow-analysis.js';
import { fallowExecutablePath } from '../verify-tool-run.js';
import type { NodeProcessRunOptions } from '../execute-verify.js';

export function fallowToolRun(
  projectRoot: string,
  configPath: string,
  analysisArgs: readonly string[],
  format: 'compact' | 'json',
  cacheDir?: string,
): NodeProcessRunOptions {
  return {
    name: 'fallow',
    runtime: 'native',
    args: [
      fallowExecutablePath(),
      ...analysisArgs,
      '--config',
      configPath,
      '--root',
      projectRoot,
      '--format',
      format,
      '--quiet',
    ],
    cwd: projectRoot,
    environment: fallowCacheEnvironment(projectRoot, cacheDir),
    failurePrefix: 'verify: failed to start ',
  };
}
