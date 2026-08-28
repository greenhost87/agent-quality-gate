import { resolve } from 'node:path';

import { createCli, parseCli } from '../../process/command/command.js';

function assertCompatibleArgs(args: InstallArgs): void {
  if (args.localBuild && args.version !== undefined) {
    throw new Error('--local-build and --version cannot be used together');
  }
  if (args.localBuild && args.wireOnly) {
    throw new Error('--local-build and --wire-only cannot be used together');
  }
}

export function parseInstallArgs(
  argv: readonly string[],
  defaultPrefix: string,
): ParseInstallArgsResult {
  const program = createCli('install')
    .description(
      'Install agent-quality-gate from the latest GitHub Release (default), or build from this checkout with --local-build. Wires Pi, Cursor, Claude Code, and/or Codex integrations.',
    )
    .option('--prefix <path>', 'Install prefix', defaultPrefix)
    .option('--version <ver>', 'Install a specific release (e.g. 1.1.0); default: latest')
    .option(
      '--local-build',
      'Verify, test, run pack integration tests, then build from this checkout',
    )
    .option('--wire-only', 'Only wire harnesses into an existing prefix (no download)')
    .option('--pi', 'Wire Pi (alone or with --cursor/--claude/--codex)')
    .option('--cursor', 'Wire Cursor (alone or with --pi/--claude/--codex)')
    .option('--claude', 'Wire Claude Code (alone or with --pi/--cursor/--codex)')
    .option('--codex', 'Wire Codex (alone or with --pi/--cursor/--claude)')
    .option('--skip-presets', 'Do not install optional presets from a checkout presets/ directory');

  if (parseCli(program, argv) === 'help') {
    return 'help';
  }

  const opts = program.opts<{
    prefix: string;
    version?: string;
    localBuild?: boolean;
    wireOnly?: boolean;
    pi?: boolean;
    cursor?: boolean;
    claude?: boolean;
    codex?: boolean;
    skipPresets?: boolean;
  }>();

  const args: InstallArgs = {
    prefix: resolve(opts.prefix),
    version: opts.version,
    localBuild: opts.localBuild === true,
    wireOnly: opts.wireOnly === true,
    skipPresets: opts.skipPresets === true,
    piFlag: opts.pi === true,
    cursorFlag: opts.cursor === true,
    claudeFlag: opts.claude === true,
    codexFlag: opts.codex === true,
  };
  assertCompatibleArgs(args);
  return args;
}

const DEFAULT_PREFIX_HELP = '~/' + '.agent-quality-gate/install';

export const INSTALL_USAGE = `Usage: install.ts [options]

Install agent-quality-gate from the latest GitHub Release (default), or build
from this checkout with --local-build. Wires Pi, Cursor, Claude Code, and/or Codex integrations.

Options:
  --prefix <path>   Install prefix (default: ${DEFAULT_PREFIX_HELP})
  --version <ver>   Install a specific release (e.g. 1.1.0); default: latest
  --local-build     Verify, test, run pack integration tests, then build from this checkout
  --pi              Wire Pi (alone or with --cursor/--claude/--codex)
  --cursor          Wire Cursor (alone or with --pi/--claude/--codex)
  --claude          Wire Claude Code (alone or with --pi/--cursor/--codex)
  --codex           Wire Codex (alone or with --pi/--cursor/--claude)
  --wire-only       Only wire harnesses into an existing prefix (no download)
  --skip-presets    Skip syncing optional presets from checkout presets/
  -h, --help        Show this help

When no harness flags are set: install all (non-TTY), or ask (TTY).
Missing ~/.pi, ~/.cursor, ~/.claude, or ~/.codex skips that harness (directories are not created).

`;

export function printInstallUsage(): void {
  process.stdout.write(INSTALL_USAGE);
}

export type InstallArgs = {
  prefix: string;
  version: string | undefined;
  localBuild: boolean;
  wireOnly: boolean;
  skipPresets: boolean;
  piFlag: boolean;
  cursorFlag: boolean;
  claudeFlag: boolean;
  codexFlag: boolean;
};

export type ParseInstallArgsResult = InstallArgs | 'help';
