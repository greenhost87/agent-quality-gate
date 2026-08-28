import { $, Glob, file } from 'bun';
import { dirname, join, resolve } from 'node:path';

import { createCli, parseCli, reportCommandError } from '../../process/command/command.js';

import { resolveProjectRoot, toProjectRelativePath } from '../self-verify/repo-walk.js';

const PRESET_MANIFEST_GLOB = new Glob('presets/*/manifest.json');

export function parseOutdatedArgs(
  argv: readonly string[],
  defaultCwd: string = process.cwd(),
): ParseOutdatedArgsResult {
  const program = createCli('outdated')
    .option('--update', 'bun update --latest')
    .option('--cwd <path>', 'Project root to scan', defaultCwd);
  if (parseCli(program, argv) === 'help') {
    return 'help';
  }
  const opts = program.opts<{ update?: boolean; cwd: string }>();
  return {
    mode: opts.update === true ? 'update' : 'outdated',
    cwd: resolve(opts.cwd),
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

export const OUTDATED_MODES = ['outdated', 'update'] as const;

export type OutdatedMode = (typeof OUTDATED_MODES)[number];

export type OutdatedArgs = {
  mode: OutdatedMode;
  cwd: string;
};

export type ParseOutdatedArgsResult = OutdatedArgs | 'help';
