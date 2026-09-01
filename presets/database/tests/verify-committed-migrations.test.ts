import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathExists, readTextFile, writeTextFile } from '../../../process/files/files.ts';
import { runCapturedProcess } from '../../../process/run-command/run-command.ts';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  captureCommittedMigrationDiff,
  formatCommittedMigrationViolations,
  RESTORED_MIGRATION_DIFF_RELATIVE_PATH,
  restoreCommittedMigrations,
  verifyCommittedMigrations,
  writeCommittedMigrationDiff,
} from '../../../preset-catalog/database/verify-committed-migrations.ts';

const tempDirectories: string[] = [];

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function runGit(args: readonly string[], cwd: string): Promise<void> {
  const result = await runCapturedProcess({ command: 'git', args, cwd });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeTextFile(fullPath, contents);
}

async function commitFiles(
  root: string,
  relativePaths: readonly string[],
  message: string,
): Promise<void> {
  await runGit(['add', '--', ...relativePaths], root);
  await runGit(
    [
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.com',
      '-c',
      'core.autocrlf=false',
      'commit',
      '--quiet',
      '-m',
      message,
    ],
    root,
  );
}

async function initRepoWithMigration(
  relativePath = 'migrations/001_initial.js',
  contents = 'export const up = () => {};\n',
): Promise<string> {
  const root = await makeTempDirectory('aqg-committed-migrations-');
  await runGit(['init', '--quiet', '-b', 'main'], root);
  await writeProjectFile(root, relativePath, contents);
  await commitFiles(root, [relativePath], 'add migration');
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('committed migrations', () => {
  it('skips directories that are not git work trees and repos without HEAD', async () => {
    const missingGit = await makeTempDirectory('aqg-committed-migrations-nogit-');
    await writeProjectFile(
      missingGit,
      'migrations/001_initial.js',
      'export const up = () => {};\n',
    );
    expect(verifyCommittedMigrations(missingGit)).toEqual({ ok: true, violations: [] });

    const emptyRepo = await makeTempDirectory('aqg-committed-migrations-empty-');
    await runGit(['init', '--quiet', '-b', 'main'], emptyRepo);
    await writeProjectFile(emptyRepo, 'migrations/001_initial.js', 'export const up = () => {};\n');
    expect(verifyCommittedMigrations(emptyRepo)).toEqual({ ok: true, violations: [] });
  });

  it('allows committed migrations that still match HEAD', async () => {
    const root = await initRepoWithMigration();
    expect(verifyCommittedMigrations(root)).toEqual({ ok: true, violations: [] });
  });

  it('rejects modified, staged, and deleted committed migration files', async () => {
    const modified = await initRepoWithMigration();
    await writeProjectFile(
      modified,
      'migrations/001_initial.js',
      'export const up = () => { /* mutated */ };\n',
    );
    expect(verifyCommittedMigrations(modified)).toEqual({
      ok: true,
      violations: [{ path: 'migrations/001_initial.js' }],
    });

    const staged = await initRepoWithMigration();
    await writeProjectFile(
      staged,
      'migrations/001_initial.js',
      'export const up = () => { /* staged */ };\n',
    );
    await runGit(['add', '--', 'migrations/001_initial.js'], staged);
    expect(verifyCommittedMigrations(staged)).toEqual({
      ok: true,
      violations: [{ path: 'migrations/001_initial.js' }],
    });

    const deleted = await initRepoWithMigration();
    await rm(join(deleted, 'migrations', '001_initial.js'));
    expect(verifyCommittedMigrations(deleted)).toEqual({
      ok: true,
      violations: [{ path: 'migrations/001_initial.js' }],
    });
  });

  it('allows new migrations and unrelated file changes', async () => {
    const root = await initRepoWithMigration();
    await writeProjectFile(root, 'migrations/002_new.js', 'export const up = () => {};\n');
    await writeProjectFile(root, 'src/index.ts', 'export const value = 1;\n');
    expect(verifyCommittedMigrations(root)).toEqual({ ok: true, violations: [] });

    await runGit(['add', '--', 'migrations/002_new.js'], root);
    expect(verifyCommittedMigrations(root)).toEqual({ ok: true, violations: [] });
  });

  it('rejects nested committed migration files and formats violation lines', async () => {
    const root = await initRepoWithMigration(
      'migrations/helpers/001_nested.js',
      'export const up = () => { /* nested */ };\n',
    );
    await writeProjectFile(
      root,
      'migrations/helpers/001_nested.js',
      'export const up = () => { /* nested mutated */ };\n',
    );
    const result = verifyCommittedMigrations(root);
    expect(result).toEqual({
      ok: true,
      violations: [{ path: 'migrations/helpers/001_nested.js' }],
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(formatCommittedMigrationViolations(result.violations)).toBe(
      'database-committed-migration:migrations/helpers/001_nested.js',
    );
  });

  it('restores modified, staged, and deleted committed migration files', async () => {
    const original = 'export const up = () => {};\n';
    const modified = await initRepoWithMigration('migrations/001_initial.js', original);
    await writeProjectFile(
      modified,
      'migrations/001_initial.js',
      'export const up = () => { /* mutated */ };\n',
    );
    expect(restoreCommittedMigrations(modified, ['migrations/001_initial.js'])).toEqual({
      ok: true,
    });
    expect(await readTextFile(join(modified, 'migrations', '001_initial.js'))).toBe(original);

    const staged = await initRepoWithMigration('migrations/001_initial.js', original);
    await writeProjectFile(
      staged,
      'migrations/001_initial.js',
      'export const up = () => { /* staged */ };\n',
    );
    await runGit(['add', '--', 'migrations/001_initial.js'], staged);
    expect(restoreCommittedMigrations(staged, ['migrations/001_initial.js'])).toEqual({ ok: true });
    expect(await readTextFile(join(staged, 'migrations', '001_initial.js'))).toBe(original);

    const deleted = await initRepoWithMigration('migrations/001_initial.js', original);
    await rm(join(deleted, 'migrations', '001_initial.js'));
    expect(restoreCommittedMigrations(deleted, ['migrations/001_initial.js'])).toEqual({
      ok: true,
    });
    expect(await pathExists(join(deleted, 'migrations', '001_initial.js'))).toBe(true);
    expect(await readTextFile(join(deleted, 'migrations', '001_initial.js'))).toBe(original);
  });

  it('captures the discarded migration diff before restore', async () => {
    const original = 'export const up = () => {};\n';
    const root = await initRepoWithMigration('migrations/001_initial.js', original);
    await writeProjectFile(
      root,
      'migrations/001_initial.js',
      'export const up = () => { /* mutated */ };\n',
    );
    const diff = captureCommittedMigrationDiff(root, ['migrations/001_initial.js']);
    expect(await writeCommittedMigrationDiff(root, diff)).toBe(
      RESTORED_MIGRATION_DIFF_RELATIVE_PATH,
    );
    expect(await readTextFile(join(root, RESTORED_MIGRATION_DIFF_RELATIVE_PATH))).toContain(
      '/* mutated */',
    );
    expect(restoreCommittedMigrations(root, ['migrations/001_initial.js'])).toEqual({ ok: true });
    expect(await readTextFile(join(root, 'migrations', '001_initial.js'))).toBe(original);
  });
});
