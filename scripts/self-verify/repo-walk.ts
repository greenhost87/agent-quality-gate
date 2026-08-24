import { existsSync, readdirSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const LOCAL_REPO_SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.quality-fixtures',
  'dist',
  'coverage',
  'artifacts',
  'tmp',
  '.codex',
  '.idea',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  return relative(projectRoot, absolutePath).split(sep).join('/');
}

export function isInsideProject(projectRoot: string, absolutePath: string): boolean {
  const relativePath = relative(projectRoot, absolutePath);
  return !(relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath));
}

export function collectRepositoryFiles(
  directory: string,
  files: string[],
  options: { sourceExtensionsOnly?: boolean } = {},
): void {
  if (!existsSync(directory)) {
    return;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!LOCAL_REPO_SKIP_DIRECTORIES.has(entry.name)) {
        collectRepositoryFiles(absolutePath, files, options);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (options.sourceExtensionsOnly === true && !SOURCE_EXTENSIONS.has(extname(entry.name))) {
      continue;
    }
    files.push(absolutePath);
  }
}

export function resolveProjectRoot(projectRoot: string): string {
  return resolve(projectRoot);
}

export function listPresetPackageNames(presetsRoot: string): string[] {
  if (!existsSync(presetsRoot)) {
    return [];
  }
  const names: string[] = [];
  for (const entry of readdirSync(presetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!existsSync(join(presetsRoot, entry.name, 'manifest.json'))) {
      continue;
    }
    names.push(entry.name);
  }
  return names.sort((left, right) => left.localeCompare(right));
}

export function formatPrefixedViolations(
  prefix: string,
  lines: readonly string[],
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  if (lines.length === 0) {
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  return {
    exitCode: 1,
    stdout: '',
    stderr: `${lines.map((line) => `${prefix}:${line}`).join('\n')}\n`,
  };
}
