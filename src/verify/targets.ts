import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);
const IGNORED_PATH_SEGMENTS = new Set([
  '.codex',
  '.git',
  '.idea',
  '.jscpd',
  '.tmp',
  'artifacts',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);
const IGNORED_PATH_PREFIXES = ['specs/bin/fixtures/', 'specs/fixtures/'];

function normalizePath(filePath: string): string {
  return filePath.trim().replaceAll('\\', '/');
}

function pathSegments(filePath: string): string[] {
  return normalizePath(filePath)
    .split('/')
    .filter((segment) => segment.length > 0);
}

function shouldIgnorePath(filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);
  if (IGNORED_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    return true;
  }
  return pathSegments(normalizedPath).some((segment) => IGNORED_PATH_SEGMENTS.has(segment));
}

function readGitFiles(cwd: string): string[] | null {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd,
    encoding: 'utf-8',
  });
  if ((result.status ?? 1) !== 0) {
    return null;
  }
  return result.stdout
    .split('\n')
    .map((line) => normalizePath(line))
    .filter((line) => line.length > 0)
    .filter((line) => existsSync(join(cwd, line)));
}

function readFilesFromDisk(cwd: string): string[] {
  const files: string[] = [];
  const queue: string[] = [cwd];

  while (queue.length > 0) {
    const nextDir = queue.pop();
    if (!nextDir) {
      continue;
    }
    for (const entry of readdirSync(nextDir, { withFileTypes: true })) {
      const absolutePath = join(nextDir, entry.name);
      const relativePath = normalizePath(relative(cwd, absolutePath));
      if (shouldIgnorePath(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  return files;
}

function uniqueSorted(files: readonly string[]): string[] {
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function selectByExtensions(files: readonly string[], extensions: ReadonlySet<string>): string[] {
  return uniqueSorted(
    files.filter((filePath) => {
      if (shouldIgnorePath(filePath)) {
        return false;
      }
      const extension = extname(filePath).toLowerCase();
      return extensions.has(extension);
    })
  );
}

function allProjectFiles(cwd: string): string[] {
  return readGitFiles(cwd) ?? readFilesFromDisk(cwd);
}

export function resolveVerifyTargets(cwd: string = process.cwd()): {
  eslint: string[];
  remark: string[];
  tsc: string[];
  jscpd: string[];
} {
  const files = allProjectFiles(cwd);
  return {
    eslint: selectByExtensions(files, CODE_EXTENSIONS),
    remark: selectByExtensions(files, MARKDOWN_EXTENSIONS),
    tsc: selectByExtensions(files, TYPESCRIPT_EXTENSIONS),
    jscpd: selectByExtensions(files, CODE_EXTENSIONS),
  };
}
