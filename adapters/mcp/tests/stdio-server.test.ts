import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';

import { writeTextFile } from '../../../process/files/files.js';
import { readFixture } from '../../../tests/support/fixture-files.js';
import { createAgentQualityGateMcpServer } from '../stdio-server.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'stdio-server');

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function createProject(): Promise<string> {
  const root = await makeTempDirectory('quality-gate-mcp-server-project-');
  await mkdir(join(root, 'src'));
  await writeTextFile(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'mcp-server-fixture', private: true, type: 'module' }, null, 2)}\n`,
  );
  await writeTextFile(
    join(root, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(
    join(root, 'src', 'index.ts'),
    await readFixture(FIXTURES_ROOT, 'clean', 'src/index.ts'),
  );
  return root;
}

async function writeConfig(projectRoot: string): Promise<string> {
  const directory = await makeTempDirectory('quality-gate-mcp-server-config-');
  const path = join(directory, 'config.yaml');
  await writeTextFile(
    path,
    YAML.stringify({ projects: [{ root: projectRoot, entries: ['src/index.ts'] }] }, null, 2),
  );
  return path;
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

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('MCP stdio server workspace binding', () => {
  it('uses host cwd and exposes verify with empty input when Roots are unavailable', async () => {
    const projectRoot = await createProject();
    const connection = await connectMcp({
      hostCwd: projectRoot,
      configPath: await writeConfig(projectRoot),
    });
    try {
      const tools = await connection.client.listTools();
      expect(tools.tools).toHaveLength(1);
      expect(tools.tools[0]?.name).toBe('verify');
      expect(tools.tools[0]?.inputSchema).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      });
      const result = await connection.client.callTool({ name: 'verify', arguments: {} });
      expect(result.isError).toBe(false);
      const content: unknown = result.content;
      expect(JSON.stringify(content)).toContain('verify: ok');
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
    const projectRoot = await createProject();
    const connection = await connectMcp({
      hostCwd: projectRoot,
      configPath: await writeConfig(projectRoot),
    });
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
