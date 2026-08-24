import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile, writeTextFile } from '../../process/files/files.js';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, describe, expect, it } from 'bun:test';
import { spawn } from 'bun';

import packageJson from '../../package.json' with { type: 'json' };
import { createEnv, getOptionalEnv } from '../../gate/read-env/read-env.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';
import { fixturePath, readFixture } from '../../tests/support/fixture-files.js';
import { mcpToolResultText } from './mcp-tool-text.js';

useIsolatedAgentQualityGateHome();

const REPO_ROOT = join(import.meta.dir, '..', '..');
const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'release-package');
const RELEASE_PACKAGE = join(
  REPO_ROOT,
  'artifacts',
  `agent-quality-gate-${packageJson.version}.tgz`,
);
const tempDirectories: string[] = [];

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const child = spawn([command, ...args], {
    cwd,
    env: createEnv({}),
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

async function createInstallRoot(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'quality-gate-release-'));
  tempDirectories.push(cwd);
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-gate-fixture',
        private: true,
        type: 'module',
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
  return cwd;
}

afterAll(async () => {
  await Promise.all(
    tempDirectories.map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('release package', () => {
  it('preserves optional Pi peer metadata in the packed tarball', async () => {
    const packedManifest = await runCommand(
      'tar',
      ['-xOf', RELEASE_PACKAGE, 'package/package.json'],
      REPO_ROOT,
    );
    expect(packedManifest.exitCode).toBe(0);

    const manifest: unknown = JSON.parse(packedManifest.stdout);
    expect(manifest).toMatchObject({
      peerDependencies: {
        '@earendil-works/pi-coding-agent':
          packageJson.peerDependencies['@earendil-works/pi-coding-agent'],
      },
      peerDependenciesMeta: {
        '@earendil-works/pi-coding-agent': { optional: true },
      },
    });
  });

  it('installs without pulling in the optional Pi peer dependency', async () => {
    const cwd = await createInstallRoot();
    const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
    expect(install.exitCode).toBe(0);

    const installedPackageJson: unknown = JSON.parse(
      await readTextFile(join(cwd, 'node_modules', 'agent-quality-gate', 'package.json')),
    );
    expect(installedPackageJson).toMatchObject({
      peerDependencies: {
        '@earendil-works/pi-coding-agent':
          packageJson.peerDependencies['@earendil-works/pi-coding-agent'],
      },
      peerDependenciesMeta: {
        '@earendil-works/pi-coding-agent': { optional: true },
      },
    });
    expect(
      existsSync(join(cwd, 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json')),
    ).toBe(false);
  });

  it('installs the Pi extension and preset assets without consumer dependencies', async () => {
    const cwd = await createInstallRoot();
    const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
    expect(install.exitCode).toBe(0);

    const installedPackage = join(cwd, 'node_modules', 'agent-quality-gate');
    const installedPackageJson = await readTextFile(join(installedPackage, 'package.json'));
    const piManifest = await readFixture(
      FIXTURES_ROOT,
      'installed-package',
      'pi-extension-manifest.txt',
    );
    expect(installedPackageJson).toContain(piManifest.trimEnd());
    expect(installedPackageJson).not.toContain('"dotenv"');
    expect(installedPackageJson).not.toContain('"pg"');
    expect(installedPackageJson).not.toContain('"testcontainers"');
    await readTextFile(join(installedPackage, 'dist', 'extensions', 'pi.js'));
    await readTextFile(join(installedPackage, 'dist', 'cursor', 'mcp-server.js'));
    await readTextFile(join(installedPackage, 'dist', 'cursor', 'stop-hook.js'));
    await readTextFile(join(installedPackage, 'dist', 'claude', 'mcp-server.js'));
    await readTextFile(join(installedPackage, 'dist', 'claude', 'stop-hook.js'));
    await readTextFile(join(installedPackage, 'dist', 'install-cli.js'));
    const assetsDirectory = join(installedPackage, 'dist', 'extensions', 'assets');
    await readTextFile(join(assetsDirectory, 'oxlint.config.ts'));
    await readTextFile(join(assetsDirectory, '.fallowrc.json'));
    await readTextFile(join(assetsDirectory, 'global-config.yaml'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'baseline', 'manifest.json'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'baseline', 'oxlint', 'index.js'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'config', 'manifest.json'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'database', 'manifest.json'));
    await readTextFile(join(installedPackage, 'dist', 'extensions', 'preset-runtime.js'));
    await readTextFile(join(installedPackage, 'dist', 'extensions', 'public-verify.js'));
    await readTextFile(join(installedPackage, 'dist', 'extensions', 'oxlint-walk.js'));
    expect(installedPackageJson).toContain('"./preset-runtime"');
    expect(installedPackageJson).toContain('"./verify"');
    expect(installedPackageJson).toContain('"./oxlint-walk"');
  });

  it('reports managed file mismatches and enforces preset rules from the installed package', async () => {
    const cwd = await createInstallRoot();
    await writeTextFile(
      join(cwd, 'package.json'),
      `${JSON.stringify(
        {
          name: 'quality-gate-fixture',
          private: true,
          type: 'module',
          dependencies: { valibot: '1.4.2' },
        },
        null,
        2,
      )}\n`,
    );
    const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
    expect(install.exitCode).toBe(0);

    await mkdir(join(cwd, 'src'), { recursive: true });
    await writeTextFile(
      join(cwd, 'src', 'index.ts'),
      await readFixture(FIXTURES_ROOT, 'config-preset-verify', 'src/index.ts'),
    );
    await copyFile(
      fixturePath(FIXTURES_ROOT, 'installed-verify', 'run-installed-verify.ts'),
      join(cwd, 'run-installed-verify.ts'),
    );

    const run = await runCommand('bun', ['run-installed-verify.ts'], cwd);
    expect(run.exitCode).toBe(0);
  });

  it('enforces no-inline-multiline-test-data without activating a preset', async () => {
    const cwd = await createInstallRoot();
    const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
    expect(install.exitCode).toBe(0);

    await mkdir(join(cwd, 'src'), { recursive: true });
    await writeTextFile(
      join(cwd, 'src', 'index.ts'),
      await readFixture(FIXTURES_ROOT, 'config-preset-verify', 'src/index.ts'),
    );
    await mkdir(join(cwd, 'tests'), { recursive: true });
    await copyFile(
      fixturePath(FIXTURES_ROOT, 'inline-consumer-violation', 'tests/example.test.ts'),
      join(cwd, 'tests', 'example.test.ts'),
    );

    await copyFile(
      fixturePath(FIXTURES_ROOT, 'inline-consumer-verify', 'run-inline-consumer-verify.ts'),
      join(cwd, 'run-inline-consumer-verify.ts'),
    );

    const run = await runCommand('bun', ['run-inline-consumer-verify.ts'], cwd);
    expect(run.exitCode).toBe(0);
  });

  it('installs check modules for optional shipped presets', async () => {
    const cwd = await createInstallRoot();
    const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
    expect(install.exitCode).toBe(0);

    const installedPackage = join(cwd, 'node_modules', 'agent-quality-gate');
    const verifyBundle = await readTextFile(
      join(installedPackage, 'dist', 'extensions', 'verify.js'),
    );
    expect(verifyBundle).not.toContain('presentation-duplication:');
    expect(verifyBundle).not.toContain('live-ui-surface:');
    const databaseCheck = await readTextFile(
      join(installedPackage, 'dist', 'presets', 'database', 'check.js'),
    );
    const playwrightCheck = await readTextFile(
      join(installedPackage, 'dist', 'presets', 'playwright', 'check.js'),
    );
    expect(databaseCheck).not.toMatch(/from\s+["']valibot["']|require\(["']valibot["']\)/);
    expect(playwrightCheck).not.toMatch(/from\s+["']valibot["']|require\(["']valibot["']\)/);
    await readTextFile(
      join(installedPackage, 'dist', 'presets', 'playwright', 'oxlint', 'playwright.js'),
    );
  });

  it('runs verify through the installed Cursor mcp-server bundle', async () => {
    const cwd = await createInstallRoot();
    await mkdir(join(cwd, 'src'), { recursive: true });
    await copyFile(
      fixturePath(FIXTURES_ROOT, 'installed-mcp-verify', 'src/index.ts'),
      join(cwd, 'src', 'index.ts'),
    );
    await copyFile(
      fixturePath(FIXTURES_ROOT, 'installed-mcp-verify', 'tsconfig.json'),
      join(cwd, 'tsconfig.json'),
    );
    const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
    expect(install.exitCode).toBe(0);

    const home = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    if (home === undefined) {
      throw new Error('AGENT_QUALITY_GATE_HOME must be set by useIsolatedAgentQualityGateHome');
    }
    const configTemplate = await readFixture(
      FIXTURES_ROOT,
      'installed-mcp-verify',
      'config.yaml.template',
    );
    await writeTextFile(join(home, 'config.yaml'), configTemplate.replaceAll('REPLACE_ROOT', cwd));

    const mcpServerPath = join(
      cwd,
      'node_modules',
      'agent-quality-gate',
      'dist',
      'cursor',
      'mcp-server.js',
    );
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(createEnv({}))) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    const transport = new StdioClientTransport({
      command: 'bun',
      args: [mcpServerPath],
      env,
    });
    const client = new Client({ name: 'release-package-mcp-verify', version: '0.0.0' });
    await client.connect(transport);
    try {
      const result = await client.callTool({
        name: 'verify',
        arguments: { cwd },
      });
      const content = Array.isArray(result.content) ? result.content : String(result.content);
      const text = mcpToolResultText(content);
      expect(text.includes('oxlint.config.ts must contain')).toBe(false);
      expect(text.includes('packaged Oxlint assets failed')).toBe(false);
      expect(text.includes('packaged Oxlint/Fallow assets not found')).toBe(false);
      expect(result.isError).toBe(true);
      expect(text.includes('eslint(no-debugger)')).toBe(true);
      expect(text.includes('Fix only the violations listed below')).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('runs verify through the installed Claude mcp-server bundle', async () => {
    const cwd = await createInstallRoot();
    await mkdir(join(cwd, 'src'), { recursive: true });
    await copyFile(
      fixturePath(FIXTURES_ROOT, 'installed-mcp-verify', 'src/index.ts'),
      join(cwd, 'src', 'index.ts'),
    );
    await copyFile(
      fixturePath(FIXTURES_ROOT, 'installed-mcp-verify', 'tsconfig.json'),
      join(cwd, 'tsconfig.json'),
    );
    const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
    expect(install.exitCode).toBe(0);

    const home = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    if (home === undefined) {
      throw new Error('AGENT_QUALITY_GATE_HOME must be set by useIsolatedAgentQualityGateHome');
    }
    const configTemplate = await readFixture(
      FIXTURES_ROOT,
      'installed-mcp-verify',
      'config.yaml.template',
    );
    await writeTextFile(join(home, 'config.yaml'), configTemplate.replaceAll('REPLACE_ROOT', cwd));

    const mcpServerPath = join(
      cwd,
      'node_modules',
      'agent-quality-gate',
      'dist',
      'claude',
      'mcp-server.js',
    );
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(createEnv({}))) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    const transport = new StdioClientTransport({
      command: 'bun',
      args: [mcpServerPath],
      env,
    });
    const client = new Client({ name: 'release-package-claude-mcp-verify', version: '0.0.0' });
    await client.connect(transport);
    try {
      const result = await client.callTool({
        name: 'verify',
        arguments: { cwd },
      });
      const content = Array.isArray(result.content) ? result.content : String(result.content);
      const text = mcpToolResultText(content);
      expect(text.includes('oxlint.config.ts must contain')).toBe(false);
      expect(text.includes('packaged Oxlint assets failed')).toBe(false);
      expect(text.includes('packaged Oxlint/Fallow assets not found')).toBe(false);
      expect(result.isError).toBe(true);
      expect(text.includes('eslint(no-debugger)')).toBe(true);
      expect(text.includes('Fix only the violations listed below')).toBe(true);
    } finally {
      await client.close();
    }
  });
});
