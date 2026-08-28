#!/usr/bin/env bun

/**
 * Single install CLI for agent-quality-gate.
 *
 *   bun ./install.ts                 download latest release + wire
 *   bun ./install.ts local           verify/test/integration/build from this tree + install
 *   bun ./install.ts preset <root>   install one optional preset (install also syncs all optional presets from checkout presets/)
 *
 * Or: bun run install-aqg [-- local | preset <root> | …]
 *
 * Note: package.json cannot use the bare script name `install` — that is the
 * package-manager lifecycle hook that runs after `bun install`.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command, CommanderError } from 'commander';

import { reportCommandError } from './process/command/command.js';
import { runCapturedProcessSync } from './process/run-command/run-command.js';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const installLocalPath = join(repoRoot, 'scripts', 'install-local', 'install-local.ts');
const installPresetPath = join(repoRoot, 'scripts', 'install-preset', 'install-preset.ts');

function addWireOptions(command: Command): Command {
  return command
    .option('--prefix <path>', 'Install prefix')
    .option('--pi', 'Wire Pi')
    .option('--cursor', 'Wire Cursor')
    .option('--claude', 'Wire Claude Code')
    .option('--codex', 'Wire Codex');
}

function wireArgv(options: InstallWireOptions): string[] {
  const args: string[] = [];
  if (options.prefix !== undefined) {
    args.push('--prefix', options.prefix);
  }
  if (options.pi === true) {
    args.push('--pi');
  }
  if (options.cursor === true) {
    args.push('--cursor');
  }
  if (options.claude === true) {
    args.push('--claude');
  }
  if (options.codex === true) {
    args.push('--codex');
  }
  return args;
}

function releaseArgv(options: InstallWireOptions): string[] {
  const args = wireArgv(options);
  if (options.version !== undefined) {
    args.push('--version', options.version);
  }
  if (options.wireOnly === true) {
    args.push('--wire-only');
  }
  if (options.localBuild === true) {
    args.push('--local-build');
  }
  return args;
}

function runScript(scriptPath: string, args: readonly string[]): void {
  if (!existsSync(scriptPath)) {
    throw new Error(`missing ${scriptPath} (run from an agent-quality-gate checkout)`);
  }
  const result = runCapturedProcessSync({
    command: 'bun',
    args: [scriptPath, ...args],
    cwd: process.cwd(),
    inheritOutput: true,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  process.exitCode = result.exitCode;
}

const program = new Command('install')
  .description('Install agent-quality-gate (release download, local build, or optional preset).')
  .helpOption('-h, --help')
  .enablePositionalOptions()
  .showHelpAfterError(false)
  .exitOverride();

addWireOptions(program)
  .option('--version <ver>', 'Install a specific release; default: latest')
  .option('--wire-only', 'Only wire harnesses into an existing prefix')
  .option('--local-build', 'Alias for `install local`')
  .action((options: InstallWireOptions) => {
    runScript(installLocalPath, releaseArgv(options));
  });

addWireOptions(
  program
    .command('local')
    .description(
      'Verify, test, run pack integration tests, build from this checkout, then install',
    ),
).action((options: InstallWireOptions) => {
  runScript(installLocalPath, ['--local-build', ...wireArgv(options)]);
});

program
  .command('preset')
  .description('Install an optional preset under the AQG home presets directory')
  .argument('<source-root>', 'Absolute preset source root containing manifest.json')
  .action((sourceRoot: string) => {
    runScript(installPresetPath, [sourceRoot]);
  });

try {
  program.parse(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.help') {
      process.exitCode = 0;
    } else {
      reportCommandError('install', error.message.replace(/^error:\s*/iu, ''));
      process.exitCode = 1;
    }
  } else {
    reportCommandError('install', error instanceof Error ? error : String(error));
    process.exitCode = 1;
  }
}

export type InstallWireOptions = {
  prefix?: string;
  pi?: boolean;
  cursor?: boolean;
  claude?: boolean;
  codex?: boolean;
  version?: string;
  wireOnly?: boolean;
  localBuild?: boolean;
};
