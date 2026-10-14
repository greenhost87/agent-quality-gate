import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { join } from 'node:path';
import { readTextFile, writeTextFile } from '#system/process/files/files.ts';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'bun:test';
import { spawn } from 'bun';
import * as v from 'valibot';

import packageJson from '#package' with { type: 'json' };
import { SHIPPED_PRESET_NAMES } from '#system/presets/preset-catalog.ts';
import { createEnv, getOptionalEnv } from '#system/gate/read-env/read-env.ts';
import { useIsolatedAgentQualityGateHome } from '../support/isolated-home.ts';
import { useTrackedTempDirectories } from '../support/tracked-temp-directories.ts';
import { processOutput } from '../support/process-output.ts';
import { fixturePath, readFixture } from '../support/fixture-files.ts';
import { mcpToolResultText } from './mcp-tool-text.js';

useIsolatedAgentQualityGateHome();

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'release-package');
const RELEASE_PACKAGE = join(
  REPO_ROOT,
  'artifacts',
  `agent-quality-gate-${packageJson.version}.tgz`,
);
const { makeTempDirectory } = useTrackedTempDirectories();

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
  return await processOutput(child);
}

async function createInstallRoot(): Promise<string> {
  const cwd = await makeTempDirectory('quality-gate-release-');
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

async function installReleasePackage(cwd: string): Promise<void> {
  const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
  expect(install.exitCode).toBe(0);
}

async function writePresetVerifyEntry(cwd: string): Promise<void> {
  await mkdir(join(cwd, 'src'), { recursive: true });
  await writeTextFile(
    join(cwd, 'src', 'index.ts'),
    await readFixture(FIXTURES_ROOT, 'config-preset-verify', 'src/index.ts'),
  );
}

describe('release package', () => {
  it('preserves optional Pi peer metadata in the packed tarball', async () => {
    const packedManifest = await runCommand(
      'tar',
      ['-xOf', RELEASE_PACKAGE, 'package/package.json'],
      REPO_ROOT,
    );
    expect(packedManifest.exitCode).toBe(0);

    const manifest: {
      dependencies?: Record<string, unknown>;
      peerDependencies?: Record<string, unknown>;
    } = JSON.parse(packedManifest.stdout);
    expect(manifest).toMatchObject({
      peerDependencies: {
        '@earendil-works/pi-coding-agent':
          packageJson.peerDependencies['@earendil-works/pi-coding-agent'],
        typebox: '*',
      },
      peerDependenciesMeta: {
        '@earendil-works/pi-coding-agent': { optional: true },
      },
    });
    expect(manifest.dependencies).not.toHaveProperty('typebox');
  });

  it('installs without pulling in the optional Pi peer dependency', async () => {
    const cwd = await createInstallRoot();
    await installReleasePackage(cwd);

    const installedPackageJson: {
      dependencies?: Record<string, unknown>;
      peerDependencies?: Record<string, unknown>;
    } = JSON.parse(
      await readTextFile(join(cwd, 'node_modules', 'agent-quality-gate', 'package.json')),
    );
    expect(installedPackageJson).toMatchObject({
      peerDependencies: {
        '@earendil-works/pi-coding-agent':
          packageJson.peerDependencies['@earendil-works/pi-coding-agent'],
        typebox: '*',
      },
      peerDependenciesMeta: {
        '@earendil-works/pi-coding-agent': { optional: true },
      },
    });
    expect(installedPackageJson.dependencies).not.toHaveProperty('typebox');
    expect(
      existsSync(join(cwd, 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json')),
    ).toBe(false);
  });

  it('installs the Pi extension and preset assets without consumer dependencies', async () => {
    const cwd = await createInstallRoot();
    await installReleasePackage(cwd);

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
    await readTextFile(join(installedPackage, 'dist', 'codex', 'mcp-server.js'));
    await readTextFile(join(installedPackage, 'dist', 'codex', 'stop-hook.js'));
    await readTextFile(join(installedPackage, 'dist', 'install-cli.js'));
    const configsDirectory = join(installedPackage, 'dist', 'extensions', 'configs');
    await readTextFile(join(configsDirectory, 'oxlint.config.ts'));
    await readTextFile(join(configsDirectory, '.fallowrc.json'));
    await readTextFile(join(configsDirectory, 'global-config.yaml'));
    for (const consumerDirectory of [
      'cursor',
      'claude',
      'codex',
      'presets/baseline',
      'presets/config',
      'presets/database',
    ]) {
      await readTextFile(
        join(installedPackage, 'dist', consumerDirectory, 'configs', 'oxlint.config.ts'),
      );
      await readTextFile(
        join(installedPackage, 'dist', consumerDirectory, 'configs', '.fallowrc.json'),
      );
    }
    await readTextFile(join(installedPackage, 'dist', 'configs', 'oxlint.config.ts'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'baseline', 'manifest.json'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'baseline', 'oxlint', 'index.js'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'config', 'manifest.json'));
    await readTextFile(join(installedPackage, 'dist', 'presets', 'database', 'manifest.json'));
    const expectedSharedExports = ['./shared/verify', './shared/oxlint'];
    const installedManifest: unknown = JSON.parse(installedPackageJson);
    const parsedManifest = v.safeParse(
      v.object({ exports: v.record(v.string(), v.unknown()) }),
      installedManifest,
    );
    expect(parsedManifest.success).toBe(true);
    if (!parsedManifest.success) return;
    const releaseSharedExports = Object.keys(parsedManifest.output.exports).filter((subpath) =>
      subpath.startsWith('./shared/'),
    );
    expect(releaseSharedExports.sort()).toEqual(expectedSharedExports.sort());
    for (const subpath of [
      './shared/preset-runtime',
      './shared/oxlint-rule-bench',
      './shared/install-preset',
      './shared/generate-project-skill',
    ]) {
      expect(Object.hasOwn(parsedManifest.output.exports, subpath)).toBe(false);
    }
    expect(Object.hasOwn(parsedManifest.output.exports, './testing/oxlint')).toBe(true);
    expect(Object.hasOwn(parsedManifest.output.exports, './preset-database')).toBe(false);

    expect(
      Object.keys(packageJson.exports)
        .filter((subpath) => subpath.startsWith('./shared/'))
        .sort(),
    ).toEqual(expectedSharedExports.sort());

    await writeTextFile(
      join(cwd, 'shared-types.ts'),
      await readFixture(FIXTURES_ROOT, 'shared-types', 'shared-types.ts'),
    );
    const typecheck = await runCommand(
      'bun',
      [
        'x',
        'tsc',
        '--noEmit',
        '--strict',
        '--target',
        'ES2024',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'shared-types.ts',
      ],
      cwd,
    );
    expect(typecheck.exitCode).toBe(0);

    await copyFile(
      fixturePath(FIXTURES_ROOT, 'shared-api-runner.ts'),
      join(cwd, 'shared-api-runner.ts'),
    );
    const apiRun = await runCommand('bun', ['shared-api-runner.ts'], cwd);
    expect(apiRun.exitCode).toBe(0);
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

    await writePresetVerifyEntry(cwd);
    await copyFile(
      fixturePath(FIXTURES_ROOT, 'installed-verify', 'run-installed-verify.ts'),
      join(cwd, 'run-installed-verify.ts'),
    );

    const run = await runCommand('bun', ['run-installed-verify.ts'], cwd);
    expect(run.exitCode).toBe(0);
  });

  it('enforces no-inline-multiline-test-data without activating a preset', async () => {
    const cwd = await createInstallRoot();
    await installReleasePackage(cwd);

    await writePresetVerifyEntry(cwd);
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
    expect(verifyBundle).not.toContain('baselinePresetRepositoryVerifyRequest');
    const packagedPresetNames = (await readdir(join(installedPackage, 'dist', 'presets'))).sort();
    expect(packagedPresetNames).toEqual([...SHIPPED_PRESET_NAMES].sort());
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
});

async function runVerifyThroughBundle(
  bundle: 'cursor' | 'claude',
  clientName: string,
): Promise<void> {
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
    bundle,
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
    cwd,
    env,
  });
  const client = new Client({ name: clientName, version: '0.0.0' });
  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: 'verify',
      arguments: {},
    });
    const content = v.safeParse(v.array(v.looseObject({})), result.content);
    const parsedContent = content.success ? content.output : String(result.content);
    const text = mcpToolResultText(parsedContent);
    expect(text.includes('oxlint.config.ts must contain')).toBe(false);
    expect(text.includes('packaged Oxlint assets failed')).toBe(false);
    expect(text.includes('packaged Oxlint/Fallow assets not found')).toBe(false);
    expect(result.isError).toBe(true);
    expect(text.includes('no-debugger')).toBe(true);
    expect(text.includes('Fix only the violations listed below')).toBe(true);
  } finally {
    await client.close();
  }
}

describe('release package mcp-server bundles', () => {
  it('runs verify through the installed Cursor mcp-server bundle', async () => {
    await runVerifyThroughBundle('cursor', 'release-package-mcp-verify');
  });

  it('runs verify through the installed Claude mcp-server bundle', async () => {
    await runVerifyThroughBundle('claude', 'release-package-claude-mcp-verify');
  });
});
