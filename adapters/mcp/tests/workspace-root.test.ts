import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';

import { writeTextFile } from '../../../process/files/files.js';
import { canonicalizePath } from '../../../process/files/paths.js';
import { resolveMcpWorkspaceRoot, type McpRootsClient } from '../workspace-root.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeConfig(projectRoot: string): Promise<string> {
  const directory = await makeTempDirectory('quality-gate-mcp-workspace-root-config-');
  const path = join(directory, 'config.yaml');
  await writeTextFile(
    path,
    YAML.stringify({ projects: [{ root: projectRoot, entries: ['src/index.ts'] }] }, null, 2),
  );
  return path;
}

function createClient(options: CreateClientOptions): McpRootsClient {
  return {
    getClientCapabilities: () => (options.roots === undefined ? {} : { roots: {} }),
    listRoots: async () =>
      Promise.resolve({
        roots: options.roots?.map((uri) => ({ uri })) ?? [],
      }),
  };
}

describe('resolveMcpWorkspaceRoot', () => {
  it('uses host cwd when Roots are unavailable', async () => {
    const projectRoot = await makeTempDirectory('quality-gate-mcp-workspace-root-host-');
    const resolution = await resolveMcpWorkspaceRoot(createClient({}), {
      hostCwd: projectRoot,
      configPath: await writeConfig(projectRoot),
    });
    expect(resolution).toEqual({ root: canonicalizePath(projectRoot), source: 'hc' });
  });

  it('uses process cwd when Roots are unavailable and host cwd is omitted', async () => {
    const projectRoot = await makeTempDirectory('quality-gate-mcp-workspace-root-process-');
    const previousCwd = process.cwd();
    await mkdir(projectRoot, { recursive: true });
    process.chdir(projectRoot);
    try {
      const resolution = await resolveMcpWorkspaceRoot(createClient({}), {
        configPath: await writeConfig(projectRoot),
      });
      expect(resolution).toEqual({ root: canonicalizePath(projectRoot), source: 'pc' });
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('uses the single client Root when Roots are available', async () => {
    const projectRoot = await makeTempDirectory('quality-gate-mcp-workspace-root-client-');
    const other = await makeTempDirectory('quality-gate-mcp-workspace-root-other-');
    const resolution = await resolveMcpWorkspaceRoot(
      createClient({ roots: [pathToFileURL(projectRoot).href] }),
      {
        hostCwd: other,
        configPath: await writeConfig(projectRoot),
      },
    );
    expect(resolution).toEqual({ root: canonicalizePath(projectRoot), source: 'mr' });
  });

  it('returns source without root when the candidate is not configured', async () => {
    const parent = await makeTempDirectory('quality-gate-mcp-workspace-root-parent-');
    const projectRoot = join(parent, 'project');
    await mkdir(projectRoot);
    const resolution = await resolveMcpWorkspaceRoot(createClient({}), {
      hostCwd: parent,
      configPath: await writeConfig(projectRoot),
    });
    expect(resolution).toEqual({ source: 'hc' });
  });
});

type CreateClientOptions = {
  roots?: string[];
};
