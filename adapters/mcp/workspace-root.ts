import { fileURLToPath } from 'node:url';

import { readGlobalQualityGateConfig } from '../../config/global-config/global-config.js';
import type { WorkspaceRootSource } from '../../gate/run-stats/workspace-root-source.js';
import { canonicalizePath } from '../../process/files/paths.js';

export async function resolveMcpWorkspaceRoot(
  client: McpRootsClient,
  options: ResolveMcpWorkspaceRootOptions = {},
): Promise<McpWorkspaceRootResolution> {
  const capabilities = client.getClientCapabilities();
  if (capabilities?.roots !== undefined) {
    const candidate = await rootFromClient(client);
    return matchConfiguredProjectRoot(candidate, options.configPath, 'mr');
  }

  const source: WorkspaceRootSource = options.hostCwd === undefined ? 'pc' : 'hc';
  const candidate = canonicalizePath(options.hostCwd ?? process.cwd());
  return matchConfiguredProjectRoot(candidate, options.configPath, source);
}

async function matchConfiguredProjectRoot(
  candidate: string | undefined,
  configPath: string | undefined,
  source: WorkspaceRootSource,
): Promise<McpWorkspaceRootResolution> {
  if (candidate === undefined) {
    return { source };
  }
  const config = await readGlobalQualityGateConfig(configPath);
  return config.projects.some((project) => project.root === candidate)
    ? { root: candidate, source }
    : { source };
}

async function rootFromClient(client: McpRootsClient): Promise<string | undefined> {
  try {
    const { roots } = await client.listRoots();
    const root = roots.length === 1 ? roots[0] : undefined;
    if (root === undefined) {
      return undefined;
    }
    const url = new URL(root.uri);
    return url.protocol === 'file:' ? canonicalizePath(fileURLToPath(url)) : undefined;
  } catch {
    return undefined;
  }
}

export type McpRootsClient = {
  getClientCapabilities: () => { roots?: unknown } | undefined;
  listRoots: () => Promise<{ roots: Array<{ uri: string }> }>;
};

export type McpWorkspaceRootResolution = {
  root?: string;
  source: WorkspaceRootSource;
};

export type ResolveMcpWorkspaceRootOptions = {
  hostCwd?: string;
  configPath?: string;
};
