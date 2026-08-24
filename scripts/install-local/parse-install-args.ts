import { resolve } from 'node:path';

import type { InstallArgs, ParseInstallArgsResult } from './parse-install-args.types.js';

function requireOptionValue(option: string, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function applyArg(args: InstallArgs, arg: string, next: string | undefined): 'help' | 0 | 1 {
  switch (arg) {
    case '-h':
    case '--help':
      return 'help';
    case '--local-build':
      args.localBuild = true;
      return 0;
    case '--wire-only':
      args.wireOnly = true;
      return 0;
    case '--pi':
      args.piFlag = true;
      return 0;
    case '--cursor':
      args.cursorFlag = true;
      return 0;
    case '--claude':
      args.claudeFlag = true;
      return 0;
    case '--codex':
      args.codexFlag = true;
      return 0;
    case '--prefix':
      args.prefix = resolve(requireOptionValue('--prefix', next));
      return 1;
    case '--version':
      args.version = requireOptionValue('--version', next);
      return 1;
    default:
      throw new Error(`unexpected argument "${arg}"`);
  }
}

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
  const args: InstallArgs = {
    prefix: defaultPrefix,
    version: undefined,
    localBuild: false,
    wireOnly: false,
    piFlag: false,
    cursorFlag: false,
    claudeFlag: false,
    codexFlag: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    const consumed = applyArg(args, arg, argv[index + 1]);
    if (consumed === 'help') {
      return 'help';
    }
    index += consumed;
  }

  assertCompatibleArgs(args);
  return args;
}

export const INSTALL_USAGE = `Usage: install.sh [options]

Install agent-quality-gate from the latest GitHub Release (default), or build
from this checkout with --local-build. Wires Pi, Cursor, Claude Code, and/or Codex integrations.

Options:
  --prefix <path>   Install prefix (default: ~/.agent-quality-gate/install)
  --version <ver>   Install a specific release (e.g. 1.0.0); default: latest
  --local-build     Verify, test, run pack integration tests, then build from this checkout
  --pi              Wire Pi (alone or with --cursor/--claude/--codex)
  --cursor          Wire Cursor (alone or with --pi/--claude/--codex)
  --claude          Wire Claude Code (alone or with --pi/--cursor/--codex)
  --codex           Wire Codex (alone or with --pi/--cursor/--claude)
  --wire-only       Only wire harnesses into an existing prefix (no download)
  -h, --help        Show this help

When no harness flags are set: install all (non-TTY), or ask (TTY).
Missing ~/.pi, ~/.cursor, ~/.claude, or ~/.codex skips that harness (directories are not created).

`;

export function printInstallUsage(): void {
  process.stdout.write(INSTALL_USAGE);
}
