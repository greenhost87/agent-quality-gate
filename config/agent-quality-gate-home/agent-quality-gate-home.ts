import { rmdir, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { getOptionalEnv } from '../../gate/read-env/read-env.js';
import type { EphemeralProjectConfigPaths } from './agent-quality-gate-home.types.js';

export function agentQualityGateHome(): string {
  const override = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
  if (override !== undefined) {
    return override;
  }
  return join(homedir(), '.agent-quality-gate');
}

/** Installed optional presets live under `$AGENT_QUALITY_GATE_HOME/presets/<name>/`. */
export function homePresetsDirectory(home = agentQualityGateHome()): string {
  return join(home, 'presets');
}

export function homeInstalledPresetRoot(name: string, home = agentQualityGateHome()): string {
  return join(homePresetsDirectory(home), name);
}

export function projectArtifactRunId(): string {
  return `${process.pid.toString(36)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function projectScopedArtifactPath(
  directory: string,
  fileName: string,
  projectRoot: string,
): string {
  const id = projectArtifactRunId();
  return join(resolve(projectRoot), '.aqg', directory, fileName.replaceAll('{id}', id));
}

export function fallowConfigPathForProject(projectRoot: string): string {
  return projectScopedArtifactPath('fallow', '{id}.json', projectRoot);
}

export function oxlintConfigPathForProject(
  projectRoot: string,
  fileName = '{id}.config.ts',
): string {
  return projectScopedArtifactPath('oxlint', fileName, projectRoot);
}

async function ignoreFilesystemCodes(
  run: () => Promise<void>,
  ignoredCodes: readonly string[],
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      ignoredCodes.includes(error.code)
    ) {
      return;
    }
    throw error;
  }
}

/** Remove per-run Oxlint and Fallow configs; drop empty `.aqg/oxlint` and `.aqg/fallow` directories. */
export async function removeEphemeralProjectConfigs(
  paths: EphemeralProjectConfigPaths,
): Promise<void> {
  const configPaths = [paths.oxlintConfigPath, paths.fallowConfigPath].filter(
    (path): path is string => path !== undefined,
  );
  await Promise.all(
    configPaths.map(async (configPath) => {
      await ignoreFilesystemCodes(async () => {
        await unlink(configPath);
      }, ['ENOENT']);
    }),
  );
  const directories = new Set(configPaths.map((configPath) => dirname(configPath)));
  await Promise.all(
    [...directories].map(async (directory) => {
      await ignoreFilesystemCodes(async () => {
        await rmdir(directory);
      }, ['ENOENT', 'ENOTEMPTY']);
    }),
  );
}
