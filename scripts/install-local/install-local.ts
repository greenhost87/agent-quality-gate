#!/usr/bin/env bun

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import packageJson from '../../package.json' with { type: 'json' };
import { reportCommandError } from '../../process/command/command.js';
import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { runCapturedProcessSync } from '../../process/run-command/run-command.js';
import {
  applyHarnessPresence,
  claudeHomePath,
  codexHomePath,
  cursorHomePath,
  detectHarnessPresence,
  piHomePath,
} from './harness-homes.js';
import { downloadReleaseTarball, pinnedTarballPath } from './download-release.js';
import { runLocalBuildPreflight } from './local-build-preflight.js';
import { parseInstallArgs, printInstallUsage } from './parse-install-args.js';
import { promptHarnessChoice } from './prompt-harness.js';
import { resolveHarnessSelection } from './resolve-harness.js';
import type { HarnessChoice, HarnessPresence, HarnessSelection } from './resolve-harness.types.js';
import { wireHooksDocument, wireMcpDocument, writeWiredConfig } from './wire-cursor.js';
import { writeWiredClaudeSettingsConfig } from './wire-claude.js';
import { writeWiredCodexConfigs } from './wire-codex.js';
import type { CursorBundlePaths } from './install-local.types.js';
import type { InstallArgs } from './parse-install-args.types.js';
import { runRequired } from '../run-required/run-required.js';

function resolveSourceRepoRoot(): string | undefined {
  const fromScripts = fileURLToPath(new URL('../..', import.meta.url));
  if (existsSync(join(fromScripts, 'adapters', 'mcp', 'stdio-server.ts'))) {
    return fromScripts;
  }
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'adapters', 'mcp', 'stdio-server.ts'))) {
    return cwd;
  }
  return undefined;
}

function isMissingCommandError(error: Error): boolean {
  return 'code' in error && error.code === 'ENOENT';
}

function extractReleasePackage(prefix: string, tarball: string): void {
  rmSync(prefix, { recursive: true, force: true });
  const extractRoot = mkdtempSync(join(tmpdir(), 'aqg-install-'));
  try {
    runRequired('tar', ['-xzf', tarball, '-C', extractRoot], process.cwd(), false);
    const packageDir = join(extractRoot, 'package');
    if (!existsSync(packageDir)) {
      throw new Error(`release tarball did not contain package/: ${tarball}`);
    }
    mkdirSync(join(prefix, '..'), { recursive: true });
    cpSync(packageDir, prefix, { recursive: true });
  } finally {
    rmSync(extractRoot, { recursive: true, force: true });
  }
}

function installPackageDependencies(prefix: string): void {
  runRequired('bun', ['install'], prefix, true);
}

function bundlePaths(prefix: string, harness: 'cursor' | 'claude' | 'codex'): CursorBundlePaths {
  return {
    mcpServerPath: join(prefix, 'dist', harness, 'mcp-server.js'),
    stopHookPath: join(prefix, 'dist', harness, 'stop-hook.js'),
  };
}

function assertInstalledLayout(prefix: string): void {
  const required = [
    join(prefix, 'package.json'),
    join(prefix, 'dist', 'extensions', 'pi.js'),
    join(prefix, 'dist', 'extensions', 'verify.js'),
    join(prefix, 'dist', 'cursor', 'mcp-server.js'),
    join(prefix, 'dist', 'cursor', 'stop-hook.js'),
    join(prefix, 'dist', 'claude', 'mcp-server.js'),
    join(prefix, 'dist', 'claude', 'stop-hook.js'),
    join(prefix, 'dist', 'codex', 'mcp-server.js'),
    join(prefix, 'dist', 'codex', 'stop-hook.js'),
    join(prefix, 'dist', 'install-cli.js'),
  ];
  for (const path of required) {
    if (!existsSync(path)) {
      throw new Error(`install incomplete: missing ${path}`);
    }
  }
}

function installPiExtension(prefix: string): void {
  const remove = runCapturedProcessSync({
    command: 'pi',
    args: ['remove', prefix],
    cwd: prefix,
  });
  if (remove.error !== undefined && isMissingCommandError(remove.error)) {
    throw new Error('pi is not installed or not on PATH');
  }
  runRequired('pi', ['install', prefix], prefix, true);
}

async function wireCursorConfigs(mcpServerPath: string, stopHookPath: string): Promise<void> {
  const cursorHome = cursorHomePath();
  await writeWiredConfig(join(cursorHome, 'mcp.json'), mcpServerPath, wireMcpDocument);
  await writeWiredConfig(join(cursorHome, 'hooks.json'), stopHookPath, wireHooksDocument);
  process.stdout.write(`Wrote Cursor MCP config: ${join(cursorHome, 'mcp.json')}\n`);
  process.stdout.write(`Wrote Cursor hooks config: ${join(cursorHome, 'hooks.json')}\n`);
}

async function wireClaudeConfigs(mcpServerPath: string, stopHookPath: string): Promise<void> {
  const claudeJsonPath = join(homedir(), '.claude.json');
  const settingsPath = join(claudeHomePath(), 'settings.json');
  await writeWiredConfig(claudeJsonPath, mcpServerPath, wireMcpDocument);
  await writeWiredClaudeSettingsConfig(settingsPath, stopHookPath);
  process.stdout.write(`Wrote Claude MCP config: ${claudeJsonPath}\n`);
  process.stdout.write(`Wrote Claude settings: ${settingsPath}\n`);
}

async function wireCodexConfigs(mcpServerPath: string, stopHookPath: string): Promise<void> {
  const codexHome = codexHomePath();
  const configPath = join(codexHome, 'config.toml');
  const hooksPath = join(codexHome, 'hooks.json');
  await writeWiredCodexConfigs(configPath, hooksPath, mcpServerPath, stopHookPath);
  process.stdout.write(`Wrote Codex MCP config: ${configPath}\n`);
  process.stdout.write(`Wrote Codex hooks config: ${hooksPath}\n`);
}

function skipBundleWiring(
  label: string,
  mcpLabel: string,
  hookLabel: string,
  paths: CursorBundlePaths,
): void {
  process.stdout.write(`Skipping ${label}\n`);
  process.stdout.write(`${mcpLabel}: bun ${paths.mcpServerPath}\n`);
  process.stdout.write(`${hookLabel}: bun ${paths.stopHookPath}\n`);
}

function reportMissingHomes(selected: HarnessSelection, presence: HarnessPresence): void {
  if (selected.wirePi && !presence.piHomePresent) {
    process.stdout.write(`Skipping Pi registration (${piHomePath()} not found)\n`);
  }
  if (selected.wireCursor && !presence.cursorHomePresent) {
    process.stdout.write(`Skipping Cursor config wiring (${cursorHomePath()} not found)\n`);
  }
  if (selected.wireClaude && !presence.claudeHomePresent) {
    process.stdout.write(`Skipping Claude config wiring (${claudeHomePath()} not found)\n`);
  }
  if (selected.wireCodex && !presence.codexHomePresent) {
    process.stdout.write(`Skipping Codex config wiring (${codexHomePath()} not found)\n`);
  }
}

async function wireSelectedHarnesses(
  prefix: string,
  selected: HarnessSelection,
  wired: HarnessSelection,
): Promise<void> {
  if (wired.wirePi) {
    process.stdout.write(`Registering Pi extension from ${prefix}\n`);
    installPiExtension(prefix);
  } else if (!selected.wirePi) {
    process.stdout.write('Skipping Pi registration\n');
  }

  const cursorPaths = bundlePaths(prefix, 'cursor');
  if (wired.wireCursor) {
    await wireCursorConfigs(cursorPaths.mcpServerPath, cursorPaths.stopHookPath);
  } else if (!selected.wireCursor) {
    skipBundleWiring('Cursor config wiring', 'Cursor MCP', 'Cursor stop hook', cursorPaths);
  }

  const claudePaths = bundlePaths(prefix, 'claude');
  if (wired.wireClaude) {
    await wireClaudeConfigs(claudePaths.mcpServerPath, claudePaths.stopHookPath);
  } else if (!selected.wireClaude) {
    skipBundleWiring('Claude config wiring', 'Claude MCP', 'Claude stop hook', claudePaths);
  }

  const codexPaths = bundlePaths(prefix, 'codex');
  if (wired.wireCodex) {
    await wireCodexConfigs(codexPaths.mcpServerPath, codexPaths.stopHookPath);
  } else if (!selected.wireCodex) {
    skipBundleWiring('Codex config wiring', 'Codex MCP', 'Codex stop hook', codexPaths);
  }
}

async function resolveSelectedHarness(
  parsed: InstallArgs,
): Promise<{ selected: HarnessSelection; wired: HarnessSelection }> {
  const { piFlag, cursorFlag, claudeFlag, codexFlag } = parsed;
  const isTTY = process.stdin.isTTY;
  let promptedChoice: HarnessChoice = 'all';
  if (!piFlag && !cursorFlag && !claudeFlag && !codexFlag && isTTY) {
    promptedChoice = await promptHarnessChoice();
  }
  const selected = resolveHarnessSelection({
    piFlag,
    cursorFlag,
    claudeFlag,
    codexFlag,
    isTTY,
    prompt: () => promptedChoice,
  });
  const presence = detectHarnessPresence();
  reportMissingHomes(selected, presence);
  return { selected, wired: applyHarnessPresence(selected, presence) };
}

async function installReleasePackage(
  prefix: string,
  localBuild: boolean,
  version: string | undefined,
): Promise<void> {
  const acquired = await acquireTarball(localBuild, version);
  try {
    process.stdout.write(`Installing release package to ${prefix}\n`);
    extractReleasePackage(prefix, acquired.tarball);
    installPackageDependencies(prefix);
  } finally {
    if (acquired.cleanupDir !== undefined) {
      rmSync(acquired.cleanupDir, { recursive: true, force: true });
    }
  }
}

async function buildLocalReleaseTarball(repoRoot: string): Promise<string> {
  process.stdout.write(`Preparing local release package from ${repoRoot}\n`);
  await runLocalBuildPreflight(repoRoot);
  const tarball = pinnedTarballPath(join(repoRoot, 'artifacts'), packageJson.version);
  if (!existsSync(tarball)) {
    throw new Error(`release tarball not found: ${tarball}`);
  }
  return tarball;
}

async function acquireTarball(
  localBuild: boolean,
  version: string | undefined,
): Promise<{ tarball: string; cleanupDir: string | undefined }> {
  if (localBuild) {
    const repoRoot = resolveSourceRepoRoot();
    if (repoRoot === undefined) {
      throw new Error('--local-build requires a source checkout of agent-quality-gate');
    }
    return { tarball: await buildLocalReleaseTarball(repoRoot), cleanupDir: undefined };
  }
  const downloadDir = mkdtempSync(join(tmpdir(), 'aqg-download-'));
  process.stdout.write(
    version === undefined
      ? 'Downloading latest GitHub Release tarball\n'
      : `Downloading GitHub Release tarball for ${version}\n`,
  );
  const tarball = await downloadReleaseTarball(version, downloadDir);
  return { tarball, cleanupDir: downloadDir };
}

async function main(): Promise<void> {
  const defaultPrefix = join(agentQualityGateHome(), 'install');
  const parsed = parseInstallArgs(process.argv.slice(2), defaultPrefix);
  if (parsed === 'help') {
    printInstallUsage();
    return;
  }

  const { prefix, version, localBuild, wireOnly } = parsed;
  const { selected, wired } = await resolveSelectedHarness(parsed);
  if (!wireOnly) {
    await installReleasePackage(prefix, localBuild, version);
  }
  assertInstalledLayout(prefix);
  await wireSelectedHarnesses(prefix, selected, wired);
  const topLevel = readdirSync(prefix);
  process.stdout.write(
    `Install ready at ${prefix} (${String(topLevel.length)} top-level entries)\n`,
  );
}

try {
  await main();
} catch (error) {
  reportCommandError('install', error instanceof Error ? error : String(error));
  process.exitCode = 1;
}
