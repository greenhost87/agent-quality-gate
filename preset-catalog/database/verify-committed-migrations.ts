import { write } from 'bun';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { runCapturedProcess } from '../../process/run-command/run-command.ts';

const MIGRATIONS_PATHSPEC = 'migrations';
export const RESTORED_MIGRATION_DIFF_RELATIVE_PATH = '.aqg/restored-migration.diff';

async function runGit(projectRoot: string, args: readonly string[]): Promise<GitRun> {
  const result = await runCapturedProcess({
    command: 'git',
    args: ['-C', projectRoot, ...args],
  });
  return {
    started: result.error === undefined,
    status: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function gitFailure(run: GitRun): CommittedMigrationCheck {
  if (!run.started) {
    return { ok: false, error: 'git is required to check committed migrations' };
  }
  const detail = run.stderr.trim();
  return {
    ok: false,
    error:
      detail.length > 0 ? detail : 'git failed to inspect committed migrations under migrations/',
  };
}

async function isGitWorkTree(projectRoot: string): Promise<GitRun> {
  return await runGit(projectRoot, ['rev-parse', '--is-inside-work-tree']);
}

async function hasHead(projectRoot: string): Promise<GitRun> {
  return await runGit(projectRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']);
}

function parseNulPaths(stdout: string): string[] {
  const paths: string[] = [];
  for (const path of stdout.split('\0')) {
    if (path.length > 0) {
      paths.push(path.replaceAll('\\', '/'));
    }
  }
  paths.sort((left, right) => left.localeCompare(right));
  return paths;
}

export async function verifyCommittedMigrations(
  projectRoot: string,
): Promise<CommittedMigrationCheck> {
  const diff = await runGit(projectRoot, [
    '-c',
    'diff.renames=false',
    'diff',
    '--no-ext-diff',
    '--name-only',
    '-z',
    '--diff-filter=MDT',
    'HEAD',
    '--',
    MIGRATIONS_PATHSPEC,
  ]);
  if (diff.started && diff.status === 0) {
    const violations: CommittedMigrationViolation[] = parseNulPaths(diff.stdout).map((path) => ({
      path,
    }));
    return { ok: true, violations };
  }
  if (!diff.started) {
    return gitFailure(diff);
  }

  const workTree = await isGitWorkTree(projectRoot);
  if (!workTree.started) {
    return gitFailure(workTree);
  }
  if (workTree.status !== 0 || workTree.stdout.trim() !== 'true') {
    return { ok: true, violations: [] };
  }

  const head = await hasHead(projectRoot);
  if (!head.started) {
    return gitFailure(head);
  }
  if (head.status !== 0) {
    return { ok: true, violations: [] };
  }
  return gitFailure(diff);
}

function isMigrationPath(path: string): boolean {
  return path === MIGRATIONS_PATHSPEC || path.startsWith(`${MIGRATIONS_PATHSPEC}/`);
}

function migrationPathsFrom(paths: readonly string[]): string[] {
  return paths.flatMap((path) => (isMigrationPath(path) ? [path] : []));
}

export async function captureCommittedMigrationDiff(
  projectRoot: string,
  paths: readonly string[],
): Promise<string> {
  const migrationPaths = migrationPathsFrom(paths);
  if (migrationPaths.length === 0) {
    return '';
  }
  const diff = await runGit(projectRoot, [
    '-c',
    'diff.renames=false',
    'diff',
    '--no-ext-diff',
    '--no-color',
    'HEAD',
    '--',
    ...migrationPaths,
  ]);
  if (!diff.started || (diff.status !== 0 && diff.status !== 1)) {
    return '';
  }
  return diff.stdout;
}

export async function writeCommittedMigrationDiff(
  projectRoot: string,
  diff: string,
): Promise<string | undefined> {
  const trimmed = diff.trimEnd();
  if (trimmed.length === 0) {
    return undefined;
  }
  const absolutePath = join(projectRoot, RESTORED_MIGRATION_DIFF_RELATIVE_PATH);
  mkdirSync(dirname(absolutePath), { recursive: true });
  await write(absolutePath, `${trimmed}\n`);
  return RESTORED_MIGRATION_DIFF_RELATIVE_PATH;
}

export async function restoreCommittedMigrations(
  projectRoot: string,
  paths: readonly string[],
): Promise<CommittedMigrationRestore> {
  const migrationPaths = migrationPathsFrom(paths);
  if (migrationPaths.length === 0) {
    return { ok: true };
  }
  const restore = await runGit(projectRoot, [
    'restore',
    '--source=HEAD',
    '--staged',
    '--worktree',
    '--',
    ...migrationPaths,
  ]);
  if (!restore.started || restore.status !== 0) {
    return { ok: false, error: 'failed to restore committed migration files' };
  }
  return { ok: true };
}

export function formatCommittedMigrationViolations(
  violations: readonly CommittedMigrationViolation[],
): string {
  const lines: string[] = [];
  for (const violation of violations) {
    lines.push(`database-committed-migration:${violation.path}`);
  }
  return lines.join('\n');
}

export type CommittedMigrationViolation = {
  path: string;
};

export type CommittedMigrationCheck =
  | { ok: true; violations: readonly CommittedMigrationViolation[] }
  | { ok: false; error: string };

export type CommittedMigrationRestore = { ok: true } | { ok: false; error: string };

export type GitRun = {
  started: boolean;
  status: number;
  stdout: string;
  stderr: string;
};
