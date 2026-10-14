import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createAgentQualityGateMcpServer } from '#adapters/mcp/stdio-server.ts';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleCursorStop, selectWorkspaceCwd } from '#adapters/cursor/stop-hook.ts';
import { resolveMcpWorkspaceRoot } from '#adapters/mcp/workspace-root.ts';
import { writeTextFile } from '#system/process/files/files.ts';
import { runRequired } from '#system/scripts/run-required/run-required.ts';

import { describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import { writeTypeScriptProject } from '#system/tests/support/project-files.ts';
import {
  executeQualityGateForCwd,
  toolOutput,
} from '#system/gate/quality-gate-run/quality-gate-run.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

useIsolatedAgentQualityGateHome();

const { makeTempDirectory } = useTrackedTempDirectories();
const FIXTURES_ROOT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures',
  'quality-gate-linked-checkout',
);

function runGit(args: readonly string[], cwd: string): void {
  runRequired('git', args, cwd, false);
}

async function writeProjectFiles(
  root: string,
  fixtureCase: 'clean-function' | 'debugger-with-export',
): Promise<void> {
  await writeTypeScriptProject(
    root,
    'aqg-linked-checkout',
    await readFixture(FIXTURES_ROOT, fixtureCase, 'src/index.ts'),
  );
}

async function writeGlobalConfig(
  directory: string,
  root: string,
  extra: { presets?: readonly string[] } = {},
): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(
    configPath,
    YAML.stringify(
      {
        projects: [
          {
            root,
            entries: ['src/index.ts'],
            ...(extra.presets === undefined ? {} : { presets: extra.presets }),
          },
        ],
      },
      null,
      2,
    ),
  );
  return configPath;
}

async function createLinkedCheckout(
  options: LinkedCheckoutOptions,
): Promise<{ configPath: string; main: string; worktree: string }> {
  const main = await makeTempDirectory('aqg-linked-checkout-main-');
  await writeProjectFiles(main, 'clean-function');
  runGit(['init', '--quiet', '-b', 'main'], main);
  runGit(['add', '.'], main);
  runGit(
    [
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '-m',
      'Initial',
    ],
    main,
  );
  const worktree =
    options.layout === 'external'
      ? join(
          await makeTempDirectory('aqg-linked-checkout-host-'),
          'a1b2c3d4e5f67890',
          '01a0107c-ef20-7a94-9bed-54c62f743b1b',
        )
      : join(main, '.pi-foreman', 'worktrees', '01a00e51-7179-7112-8a08-897e9db224f6');
  await mkdir(join(worktree, '..'), { recursive: true });
  runGit(['worktree', 'add', '--quiet', '-b', 'task', worktree], main);
  if (options.mainFixture !== 'clean-function') {
    await writeProjectFiles(main, options.mainFixture);
  }
  if (options.worktreeFixture !== 'clean-function') {
    await writeProjectFiles(worktree, options.worktreeFixture);
  }
  const configPath = await writeGlobalConfig(
    await makeTempDirectory('aqg-linked-checkout-config-'),
    main,
    { presets: options.presets },
  );
  return { configPath, main, worktree };
}

async function expectWorktreeVerify(
  cwd: string,
  configPath: string,
  exitCode: number,
  diagnostic?: string,
  expectedRoot = cwd,
): Promise<void> {
  const run = await executeQualityGateForCwd(cwd, { configPath });
  expect(run.kind).toBe('ran');
  if (run.kind !== 'ran') return;
  expect(run.projectRoot).toBe(realpathSync(expectedRoot));
  expect(run.result.exitCode).toBe(exitCode);
  if (diagnostic !== undefined) {
    expect(await toolOutput(run)).toContain(diagnostic);
  }
}

describe('quality gate linked checkout', () => {
  it.each(['nested', 'external'] as const)(
    'resolves Cursor MCP Roots, host cwd and process cwd for a %s worktree',
    async (layout) => {
      const { configPath, main, worktree } = await createLinkedCheckout({
        mainFixture: 'clean-function',
        worktreeFixture: 'clean-function',
        layout,
      });
      const noRoots = {
        getClientCapabilities: () => ({}),
        listRoots: async () => Promise.resolve({ roots: [] }),
      };
      expect(
        await resolveMcpWorkspaceRoot(
          {
            getClientCapabilities: () => ({ roots: {} }),
            listRoots: async () =>
              Promise.resolve({ roots: [{ uri: pathToFileURL(worktree).href }] }),
          },
          { configPath, hostCwd: main },
        ),
      ).toEqual({ root: realpathSync(worktree), source: 'mr' });
      expect(await resolveMcpWorkspaceRoot(noRoots, { configPath, hostCwd: worktree })).toEqual({
        root: realpathSync(worktree),
        source: 'hc',
      });
      const previousCwd = process.cwd();
      process.chdir(worktree);
      try {
        expect(await resolveMcpWorkspaceRoot(noRoots, { configPath })).toEqual({
          root: realpathSync(worktree),
          source: 'pc',
        });
      } finally {
        process.chdir(previousCwd);
      }
      expect(await selectWorkspaceCwd([worktree], { configPath })).toBe(realpathSync(worktree));
      expect(await selectWorkspaceCwd([main, worktree], { configPath })).toBeUndefined();
      for (const candidate of [join(worktree, 'src'), join(worktree, '..')]) {
        expect(await selectWorkspaceCwd([candidate], { configPath })).toBeUndefined();
        expect(await resolveMcpWorkspaceRoot(noRoots, { configPath, hostCwd: candidate })).toEqual({
          source: 'hc',
        });
      }
    },
  );

  it('MCP verify accepts empty arguments and checks the worktree rather than main', async () => {
    const { configPath, main, worktree } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'debugger-with-export',
      layout: 'external',
    });
    const server = createAgentQualityGateMcpServer({ configPath, hostCwd: main });
    const client = new Client(
      { name: 'cursor-worktree-test', version: '1.0.0' },
      { capabilities: { roots: {} } },
    );
    client.setRequestHandler(ListRootsRequestSchema, () => ({
      roots: [{ uri: pathToFileURL(worktree).href }],
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect((await client.listTools()).tools[0]?.inputSchema).toEqual({
        type: 'object',
        properties: {},
        additionalProperties: false,
      });
      const result = await client.callTool({ name: 'verify', arguments: {} });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('no-debugger');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('Cursor stop hook reports worktree violations rather than the clean main checkout', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'debugger-with-export',
      layout: 'external',
    });
    const output = await handleCursorStop(
      { status: 'completed', workspace_roots: [worktree] },
      { configPath },
    );
    expect(output.followup_message).toContain('no-debugger');
  });

  it('maps a configured subproject to its exact worktree directory', async () => {
    const { main, worktree } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'clean-function',
      layout: 'external',
    });
    const nested = join(worktree, 'package');
    await writeProjectFiles(join(main, 'package'), 'clean-function');
    await writeProjectFiles(nested, 'debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('aqg-linked-subproject-config-'),
      join(main, 'package'),
    );
    expect(await selectWorkspaceCwd([worktree], { configPath })).toBeUndefined();
    expect(await selectWorkspaceCwd([nested], { configPath })).toBe(realpathSync(nested));
    const run = await executeQualityGateForCwd(nested, { configPath });
    expect(run.kind).toBe('ran');
    if (run.kind === 'ran') {
      expect(run.projectRoot).toBe(realpathSync(nested));
      expect(await toolOutput(run)).toContain('no-debugger');
    }
  });

  for (const scenario of [
    {
      title: 'runs against a nested git worktree instead of the configured main checkout',
      mainFixture: 'debugger-with-export',
      worktreeFixture: 'clean-function',
      exitCode: 0,
      diagnostic: undefined,
    },
    {
      title: 'reports violations from the nested git worktree rather than a clean main checkout',
      mainFixture: 'clean-function',
      worktreeFixture: 'debugger-with-export',
      exitCode: 1,
      diagnostic: 'no-debugger',
    },
  ] as const) {
    it(scenario.title, async () => {
      const { configPath, worktree } = await createLinkedCheckout({
        mainFixture: scenario.mainFixture,
        worktreeFixture: scenario.worktreeFixture,
      });
      await expectWorktreeVerify(worktree, configPath, scenario.exitCode, scenario.diagnostic);
    });
  }

  it('runs against an external git worktree of a configured project', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'debugger-with-export',
      worktreeFixture: 'clean-function',
      layout: 'external',
    });

    await expectWorktreeVerify(join(worktree, 'src'), configPath, 0, undefined, worktree);
  });

  it('skips a separate git checkout that does not share a repository with a configured project', async () => {
    const { configPath } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'clean-function',
      layout: 'external',
    });
    const other = await makeTempDirectory('aqg-linked-checkout-other-');
    await writeProjectFiles(other, 'debugger-with-export');
    runGit(['init', '--quiet', '-b', 'main'], other);

    const run = await executeQualityGateForCwd(other, { configPath });

    expect(run.kind).toBe('skipped');
    expect(await selectWorkspaceCwd([other], { configPath })).toBeUndefined();
    expect(
      await resolveMcpWorkspaceRoot(
        {
          getClientCapabilities: () => ({}),
          listRoots: async () => Promise.resolve({ roots: [] }),
        },
        { configPath, hostCwd: other },
      ),
    ).toEqual({ source: 'hc' });
  });
});

export type LinkedCheckoutOptions = {
  mainFixture: 'clean-function' | 'debugger-with-export';
  worktreeFixture: 'clean-function' | 'debugger-with-export';
  layout?: 'nested' | 'external';
  presets?: readonly string[];
};
