import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { resolveLintableExtensions } from './config/policy.js';

const LINTABLE_EXTENSIONS = new Set(resolveLintableExtensions());
const DIRECTIVE_PATTERN = /\boxlint-disable\b/u;

function collectLineViolations(relativePath: string, content: string, violations: string[]): void {
  for (const [index, line] of content.split('\n').entries()) {
    if (DIRECTIVE_PATTERN.test(line)) {
      violations.push(`${relativePath}:${index + 1}:${line.indexOf('-') + 1}`);
    }
  }
}

async function collectDirectoryViolations(
  cwd: string,
  directory: string,
  directories: string[],
  ignoredRootPaths: Set<string>,
  violations: string[]
): Promise<void> {
  for (const entry of await readdir(join(cwd, directory), { withFileTypes: true })) {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const isIgnoredRootDotDirectory =
        directory === '.' && entry.name.startsWith('.') && ignoredRootPaths.has('.*');
      if (!isIgnoredRootDotDirectory && !ignoredRootPaths.has(relativePath)) {
        directories.push(relativePath);
      }
      continue;
    }
    if (!entry.isFile() || !LINTABLE_EXTENSIONS.has(extname(entry.name))) {
      continue;
    }
    collectLineViolations(relativePath, await readFile(join(cwd, relativePath), 'utf8'), violations);
  }
}

async function findLintDirectiveViolations(cwd: string, ignoredPaths: readonly string[]): Promise<string[]> {
  const directories = ['.'];
  const ignoredRootPaths = new Set(ignoredPaths);
  const violations: string[] = [];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory !== undefined) {
      await collectDirectoryViolations(cwd, directory, directories, ignoredRootPaths, violations);
    }
  }
  return violations;
}

export async function rejectOxlintDisableDirectives(cwd: string, ignoredPaths: readonly string[]): Promise<number> {
  const violations = await findLintDirectiveViolations(cwd, ignoredPaths);
  if (violations.length === 0) {
    return 0;
  }
  process.stderr.write(`Inline lint directives are forbidden:\n${violations.join('\n')}\n`);
  return 1;
}
