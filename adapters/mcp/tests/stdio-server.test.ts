import { mkdir } from 'node:fs/promises';

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'bun:test';

import { createTempYamlConfig, projectConfig } from '#system/tests/support/config-fixtures.js';
import { readFixture } from '#system/tests/support/fixture-files.js';
import { writeTypeScriptProject } from '#system/tests/support/project-files.js';
import { createAgentQualityGateMcpServer } from '../stdio-server.js';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.js';

const { makeTempDirectory } = useTrackedTempDirectories();
const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'stdio-server');

async function createProject(): Promise<string> {
  const root = await makeTempDirectory('quality-gate-mcp-server-project-');
  await writeTypeScriptProject(
    root,
    'mcp-server-fixture',
    await readFixture(FIXTURES_ROOT, 'clean', 'src/index.ts'),
  );
  return root;
}

async function writeConfig(projectRoot: string): Promise<string> {
  return createTempYamlConfig(
    makeTempDirectory,
    'quality-gate-mcp-server-config-',
    projectConfig(projectRoot),
  );
}

async function connectMcp(options: ConnectMcpOptions): Promise<ConnectedMcp> {
  const server = createAgentQualityGateMcpServer({
    hostCwd: options.hostCwd,
    configPath: options.configPath,
  });
  const client = new Client(
    { name: 'quality-gate-test-client', version: '1.0.0' },
    options.roots === undefined ? {} : { capabilities: { roots: { listChanged: true } } },
  );
  if (options.roots !== undefined) {
    client.setRequestHandler(ListRootsRequestSchema, () => ({
      roots: options.roots?.map((uri) => ({ uri })) ?? [],
    }));
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

async function connectProjectMcp(): Promise<{ projectRoot: string; connection: ConnectedMcp }> {
  const projectRoot = await createProject();
  const connection = await connectMcp({
    hostCwd: projectRoot,
    configPath: await writeConfig(projectRoot),
  });
  return { projectRoot, connection };
}

async function expectVerifyToolOk(connection: ConnectedMcp): Promise<void> {
  const tools = await connection.client.listTools();
  expect(tools.tools).toHaveLength(1);
  expect(tools.tools[0]?.name).toBe('verify');
  const result = await connection.client.callTool({ name: 'verify', arguments: {} });
  expect(result.isError).toBe(false);
  expect(JSON.stringify(result.content)).toContain('verify: ok');
}

describe('MCP stdio server workspace binding', () => {
  it('uses host cwd and exposes verify with empty input when Roots are unavailable', async () => {
    const { connection } = await connectProjectMcp();
    try {
      const tools = await connection.client.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0]?.name).toBe('verify');
      expect(tools.tools[0]?.inputSchema).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      });
      await expectVerifyToolOk(connection);
    } finally {
      await connection.close();
    }
  });

  it('hides verify when host cwd is not exactly a configured project root', async () => {
    const parent = await makeTempDirectory('quality-gate-mcp-server-parent-');
    const projectRoot = join(parent, 'project');
    await mkdir(projectRoot);
    const connection = await connectMcp({
      hostCwd: parent,
      configPath: await writeConfig(projectRoot),
    });
    try {
      expect((await connection.client.listTools()).tools).toEqual([]);
      expect(connection.client.callTool({ name: 'verify', arguments: {} })).rejects.toThrow(
        'Verify is unavailable for this workspace',
      );
    } finally {
      await connection.close();
    }
  });

  it('uses the single client Root instead of host cwd when Roots are available', async () => {
    const projectRoot = await createProject();
    const other = await makeTempDirectory('quality-gate-mcp-server-other-');
    const connection = await connectMcp({
      hostCwd: other,
      configPath: await writeConfig(projectRoot),
      roots: [pathToFileURL(projectRoot).href],
    });
    try {
      expect((await connection.client.listTools()).tools[0]?.name).toBe('verify');
      const result = await connection.client.callTool({ name: 'verify', arguments: {} });
      expect(result.isError).toBe(false);
    } finally {
      await connection.close();
    }
  });

  it('fails closed for multiple client Roots without falling back to host cwd', async () => {
    const projectRoot = await createProject();
    const other = await makeTempDirectory('quality-gate-mcp-server-second-root-');
    const connection = await connectMcp({
      hostCwd: projectRoot,
      configPath: await writeConfig(projectRoot),
      roots: [pathToFileURL(projectRoot).href, pathToFileURL(other).href],
    });
    try {
      expect((await connection.client.listTools()).tools).toEqual([]);
    } finally {
      await connection.close();
    }
  });

  it('rejects model-supplied cwd arguments', async () => {
    const { projectRoot, connection } = await connectProjectMcp();
    try {
      expect(
        connection.client.callTool({ name: 'verify', arguments: { cwd: projectRoot } }),
      ).rejects.toThrow('Invalid arguments for tool verify');
    } finally {
      await connection.close();
    }
  });
});

type ConnectMcpOptions = {
  hostCwd: string;
  configPath: string;
  roots?: string[];
};

type ConnectedMcp = {
  client: Client;
  close: () => Promise<void>;
};
