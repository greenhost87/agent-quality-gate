import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.claude',
  '.codex',
  '.fallow',
  '.git',
  '.idea',
  '.tmp',
  'artifacts',
  'coverage',
  'node_modules',
]);
const IGNORED_PATHS = new Set(['build', 'dist', 'tmp', join('specs', 'bin', 'fixtures')]);
const LINTABLE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const DIRECTIVE_PATTERN = /\b(?:eslint|oxlint)-(?:disable|enable)\b/u;

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
  violations: string[]
): Promise<void> {
  for (const entry of await readdir(join(cwd, directory), { withFileTypes: true })) {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name) && !IGNORED_PATHS.has(relativePath)) {
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

async function findLintDirectiveViolations(cwd: string): Promise<string[]> {
  const directories = ['.'];
  const violations: string[] = [];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory !== undefined) {
      await collectDirectoryViolations(cwd, directory, directories, violations);
    }
  }
  return violations;
}

export async function runLintDirectiveCheck(cwd: string): Promise<number> {
  const violations = await findLintDirectiveViolations(cwd);
  if (violations.length === 0) {
    return 0;
  }
  process.stderr.write(`Inline lint directives are forbidden:\n${violations.join('\n')}\n`);
  return 1;
}
