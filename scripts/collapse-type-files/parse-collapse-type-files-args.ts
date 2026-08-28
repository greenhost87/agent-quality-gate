import { resolve } from 'node:path';

import { createCli, parseCli } from '../../process/command/command.js';

export function parseCollapseTypeFilesArgs(
  argv: readonly string[],
  defaultCwd: string = process.cwd(),
): ParseCollapseTypeFilesArgsResult {
  const program = createCli('collapse-types')
    .option('--cwd <path>', 'Project root to collapse', defaultCwd)
    .option('--dry-run', 'Report changes without writing');
  if (parseCli(program, argv) === 'help') {
    return 'help';
  }

  return {
    cwd: resolve(String(program.getOptionValue('cwd'))),
    dryRun: program.getOptionValue('dryRun') === true,
  };
}

export const COLLAPSE_TYPE_FILES_USAGE = `Usage: bun run collapse-types [--cwd <path>] [--dry-run]

Merge basename *.types.ts files into their owners and rewrite importers.
Uses fallow viz fan-in when no basename companion exists: sole importer, else
same-directory route/page/helpers among importers. Other type files are skipped.

  --cwd <path>  Project root (defaults to the current working directory)
  --dry-run     Report changes without writing
  -h, --help    Show this help

`;

export function printCollapseTypeFilesUsage(): void {
  process.stdout.write(COLLAPSE_TYPE_FILES_USAGE);
}

export type CollapseTypeFilesArgs = {
  cwd: string;
  dryRun: boolean;
};

export type ParseCollapseTypeFilesArgsResult = CollapseTypeFilesArgs | 'help';
