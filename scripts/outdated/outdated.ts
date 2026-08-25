import { $, Glob, file } from 'bun';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { reportCommandError } from '../../process/command/command.js';
import type { OutdatedMode, ParseOutdatedArgsResult } from './outdated.types.js';
import { resolveProjectRoot, toProjectRelativePath } from '../self-verify/repo-walk.js';

const PRESET_MANIFEST_GLOB = new Glob('presets/*/manifest.json');

export function parseOutdatedArgs(
  argv: readonly string[],
  defaultCwd: string = process.cwd(),
): ParseOutdatedArgsResult {
  let values: {
    help?: boolean;
    update?: boolean;
    cwd?: string;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      options: {
        help: { type: 'boolean', short: 'h', default: false },
        update: { type: 'boolean', default: false },
        cwd: { type: 'string' },
      },
      allowPositionals: true,
      strict: true,
    }));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error });
  }

  const unexpected = positionals[0];
  if (unexpected !== undefined) {
    throw new Error(`unexpected argument "${unexpected}"`);
  }
  if (values.help === true) {
    return 'help';
  }

  return {
    mode: values.update === true ? 'update' : 'outdated',
    cwd: values.cwd === undefined ? resolve(defaultCwd) : resolve(values.cwd),
  };
}

export const OUTDATED_USAGE = `Usage: bun run outdated [--update] [--cwd <path>]

Check or refresh Bun dependencies in the project root and every preset pack
that has a lockfile.

  (default)     bun outdated
  --update      bun update --latest
  --cwd <path>  Project root to scan (defaults to the current working directory)
  -h, --help    Show this help

`;

export function printOutdatedUsage(): void {
  process.stdout.write(OUTDATED_USAGE);
}

async function hasBunLockfile(directory: string): Promise<boolean> {
  return (
    (await file(join(directory, 'bun.lock')).exists()) ||
    (await file(join(directory, 'bun.lockb')).exists())
  );
}

async function isDependencyPackageRoot(directory: string): Promise<boolean> {
  return (
    (await file(join(directory, 'package.json')).exists()) && (await hasBunLockfile(directory))
  );
}

export async function listDependencyPackageRoots(projectRoot: string): Promise<string[]> {
  const root = resolveProjectRoot(projectRoot);
  const roots: string[] = [];
  if (await isDependencyPackageRoot(root)) {
    roots.push(root);
  }

  const presetRoots: string[] = [];
  for await (const relativePath of PRESET_MANIFEST_GLOB.scan({
    cwd: root,
    onlyFiles: true,
  })) {
    const presetRoot = join(root, dirname(relativePath));
    if (await isDependencyPackageRoot(presetRoot)) {
      presetRoots.push(presetRoot);
    }
  }
  presetRoots.sort((left, right) => left.localeCompare(right));
  roots.push(...presetRoots);
  return roots;
}

function packageRootLabel(projectRoot: string, packageRoot: string): string {
  const root = resolveProjectRoot(projectRoot);
  if (packageRoot === root) {
    return 'repository';
  }
  return toProjectRelativePath(root, packageRoot);
}

export async function runDependencyCommand(
  projectRoot: string,
  mode: OutdatedMode,
): Promise<number> {
  const root = resolveProjectRoot(projectRoot);
  const packageRoots = await listDependencyPackageRoots(root);
  if (packageRoots.length === 0) {
    throw new Error(`no Bun package roots with a lockfile under ${root}`);
  }

  let exitCode = 0;
  for (const packageRoot of packageRoots) {
    process.stdout.write(`${packageRootLabel(root, packageRoot)}\n`);
    const result =
      mode === 'update'
        ? await $`bun update --latest`.cwd(packageRoot).nothrow()
        : await $`bun outdated`.cwd(packageRoot).nothrow();
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
      process.exitCode = await runDependencyCommand(parsed.cwd, parsed.mode);
    }
  } catch (error) {
    reportCommandError('outdated', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}
