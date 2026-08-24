import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { reportCommandError } from '../../process/command/command.js';
import { runCapturedProcessSync } from '../../process/run-command/run-command.js';
import { hasBunLockfile } from '../self-verify/has-bun-lockfile.js';
import type { OutdatedMode, ParseOutdatedArgsResult } from './outdated.types.js';
import {
  listPresetPackageNames,
  resolveProjectRoot,
  toProjectRelativePath,
} from '../self-verify/repo-walk.js';

const PRESETS_DIRECTORY = 'presets';

export function parseOutdatedArgs(argv: readonly string[]): ParseOutdatedArgsResult {
  let mode: OutdatedMode = 'outdated';

  for (const arg of argv) {
    switch (arg) {
      case '-h':
      case '--help':
        return 'help';
      case '--update':
        mode = 'update';
        break;
      default:
        throw new Error(`unexpected argument "${arg}"`);
    }
  }

  return { mode };
}

export const OUTDATED_USAGE = `Usage: bun run outdated [--update]

Check or refresh Bun dependencies in the repository root and every preset
pack that has a lockfile.

  (default)     bun outdated
  --update      bun update --latest
  -h, --help    Show this help

`;

export function printOutdatedUsage(): void {
  process.stdout.write(OUTDATED_USAGE);
}

export function bunDependencyArgs(mode: OutdatedMode): readonly string[] {
  return mode === 'update' ? (['update', '--latest'] as const) : (['outdated'] as const);
}

function isDependencyPackageRoot(directory: string): boolean {
  return existsSync(join(directory, 'package.json')) && hasBunLockfile(directory);
}

export function listDependencyPackageRoots(projectRoot: string): string[] {
  const root = resolveProjectRoot(projectRoot);
  const roots: string[] = [];
  if (isDependencyPackageRoot(root)) {
    roots.push(root);
  }
  const presetsRoot = join(root, PRESETS_DIRECTORY);
  for (const name of listPresetPackageNames(presetsRoot)) {
    const presetRoot = join(presetsRoot, name);
    if (isDependencyPackageRoot(presetRoot)) {
      roots.push(presetRoot);
    }
  }
  return roots;
}

function packageRootLabel(projectRoot: string, packageRoot: string): string {
  const root = resolveProjectRoot(projectRoot);
  if (packageRoot === root) {
    return 'repository';
  }
  return toProjectRelativePath(root, packageRoot);
}

export function runDependencyCommand(projectRoot: string, mode: OutdatedMode): number {
  const root = resolveProjectRoot(projectRoot);
  const args = bunDependencyArgs(mode);
  let exitCode = 0;

  for (const packageRoot of listDependencyPackageRoots(root)) {
    process.stdout.write(`${packageRootLabel(root, packageRoot)}\n`);
    const result = runCapturedProcessSync({
      command: 'bun',
      args: [...args],
      cwd: packageRoot,
      inheritOutput: true,
    });
    if (result.error !== undefined) {
      throw result.error;
    }
    if (result.exitCode !== 0 && exitCode === 0) {
      exitCode = result.exitCode;
    }
  }

  return exitCode;
}

if (import.meta.main) {
  try {
    const parsed = parseOutdatedArgs(process.argv.slice(2));
    if (parsed === 'help') {
      printOutdatedUsage();
    } else {
      process.exitCode = runDependencyCommand(process.cwd(), parsed.mode);
    }
  } catch (error) {
    reportCommandError('outdated', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}
