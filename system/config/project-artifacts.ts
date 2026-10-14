import { join, resolve } from 'node:path';

export function projectArtifactRunId(): string {
  return `${process.pid.toString(36)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function projectScopedArtifactPath(
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

function verifyCachePathForProject(
  projectRoot: string,
  tool: 'fallow' | 'oxlint',
  fileName: string,
): string {
  return join(resolve(projectRoot), '.aqg', 'cache', tool, fileName);
}

/** Persistent generated Fallow config reused across verify runs. */
export function verifyFallowConfigPathForProject(projectRoot: string): string {
  return verifyCachePathForProject(projectRoot, 'fallow', 'verify.json');
}

/**
 * Persistent Fallow config for the `dupes`-cache verify launches: the
 * dedicated `ui` run (second launch) and the `dupes` run (third launch).
 * Same project scope as `verify.json`, but points at the `dupes` extraction
 * cache instead of the `combined` one.
 */
export function verifyDupesFallowConfigPathForProject(projectRoot: string): string {
  return verifyCachePathForProject(projectRoot, 'fallow', 'verify-dupes.json');
}

/**
 * Fallow extraction cache (`cache.dir`) for the first verify launch
 * (`check + health`, `--skip dupes`).
 */
export function fallowCombinedCacheDirForProject(projectRoot: string): string {
  return verifyCachePathForProject(projectRoot, 'fallow', 'combined');
}

/**
 * Fallow extraction cache (`cache.dir`) shared by the second (`ui`) and
 * third (`dupes` + `list`) verify launches.
 */
export function fallowDupesCacheDirForProject(projectRoot: string): string {
  return verifyCachePathForProject(projectRoot, 'fallow', 'dupes');
}

/** Persistent generated Oxlint config reused across verify runs. */
export function verifyOxlintConfigPathForProject(projectRoot: string): string {
  return verifyCachePathForProject(projectRoot, 'oxlint', 'verify.config.ts');
}

export function oxlintConfigPathForProject(
  projectRoot: string,
  fileName = '{id}.config.ts',
): string {
  return projectScopedArtifactPath('oxlint', fileName, projectRoot);
}
