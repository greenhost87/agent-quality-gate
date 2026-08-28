#!/usr/bin/env bun

import { reportCommandError } from '../../process/command/command.js';
import { collapseTypeFiles } from './collapse-type-files.js';
import {
  parseCollapseTypeFilesArgs,
  printCollapseTypeFilesUsage,
} from './parse-collapse-type-files-args.js';

try {
  const parsed = parseCollapseTypeFilesArgs(process.argv.slice(2));
  if (parsed === 'help') {
    printCollapseTypeFilesUsage();
  } else {
    const result = await collapseTypeFiles(parsed.cwd, {
      dryRun: parsed.dryRun,
    });
    const mode = result.dryRun ? 'would collapse' : 'collapsed';
    process.stdout.write(
      `${mode} ${String(result.pairs)} type files; skipped ${String(result.skippedFiles.length)} ownerless files; changed ${String(result.changedFiles)} owners/importers\n`,
    );
    for (const path of result.skippedFiles) {
      process.stdout.write(`skipped ownerless: ${path}\n`);
    }
  }
} catch (error) {
  reportCommandError('collapse-types', error instanceof Error ? error : String(error));
  process.exitCode = 2;
}
