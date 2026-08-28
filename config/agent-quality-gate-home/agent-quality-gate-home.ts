import { readdir, rmdir, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { getOptionalEnv } from '../../gate/read-env/read-env.js';

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

/** Stable path reused by every fallow phase within one verify run (shared extraction cache). */
export function verifyFallowConfigPathForProject(projectRoot: string): string {
  return join(resolve(projectRoot), '.aqg', 'fallow', 'verify.json');
}

/** Stable path reused by every verify run (overwritten in place). */
export function verifyOxlintConfigPathForProject(projectRoot: string): string {
  return join(resolve(projectRoot), '.aqg', 'oxlint', 'verify.config.ts');
}

export function projectStableArtifactPath(
  directory: string,
  fileName: string,
  projectRoot: string,
): string {
  return join(resolve(projectRoot), '.aqg', directory, fileName);
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

async function removeEphemeralProjectDirectory(
  projectRoot: string,
  name: 'fallow' | 'oxlint',
): Promise<void> {
  const directory = join(resolve(projectRoot), '.aqg', name);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code === 'ENOENT'
    ) {
      return;
    }
    throw error;
  }
  await Promise.all(
    entries.map(async (entry) => {
      await ignoreFilesystemCodes(async () => {
        await unlink(join(directory, entry));
      }, ['ENOENT']);
    }),
  );
  await ignoreFilesystemCodes(async () => {
    await rmdir(directory);
  }, ['ENOENT', 'ENOTEMPTY']);
}

/** Remove verify Oxlint/Fallow configs and preset scratch files; drop empty `.aqg/oxlint` and `.aqg/fallow`. */
export async function removeEphemeralProjectConfigs(
  projectRoot: string,
  paths: EphemeralProjectConfigPaths,
): Promise<void> {
  const configPaths = [paths.oxlintConfigPath, ...paths.fallowConfigPaths].filter(
    (path): path is string => path !== undefined,
  );
  await Promise.all(
    configPaths.map(async (configPath) => {
      await ignoreFilesystemCodes(async () => {
        await unlink(configPath);
      }, ['ENOENT']);
    }),
  );
  await Promise.all([
    removeEphemeralProjectDirectory(projectRoot, 'fallow'),
    removeEphemeralProjectDirectory(projectRoot, 'oxlint'),
  ]);
}

export type EphemeralProjectConfigPaths = {
  oxlintConfigPath?: string;
  fallowConfigPaths: string[];
};
