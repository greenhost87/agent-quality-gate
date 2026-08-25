import { write } from 'bun';
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { listDependencyPackageRoots, OUTDATED_USAGE, parseOutdatedArgs } from '../outdated.js';

const DEFAULT_CWD = '/tmp/aqg-outdated-default';
const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');
const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aqg-outdated-roots-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

describe('parseOutdatedArgs', () => {
  it('defaults to outdated mode at the provided cwd', () => {
    expect(parseOutdatedArgs([], DEFAULT_CWD)).toEqual({
      mode: 'outdated',
      cwd: DEFAULT_CWD,
    });
  });

  it('accepts --update and keeps the default cwd', () => {
    expect(parseOutdatedArgs(['--update'], DEFAULT_CWD)).toEqual({
      mode: 'update',
      cwd: DEFAULT_CWD,
    });
  });

  it('resolves --cwd relative to the process working directory', () => {
    expect(parseOutdatedArgs(['--cwd', '.'], DEFAULT_CWD)).toEqual({
      mode: 'outdated',
      cwd: resolve('.'),
    });
  });

  it('accepts --cwd with --update', () => {
    expect(parseOutdatedArgs(['--cwd', '/tmp/target', '--update'], DEFAULT_CWD)).toEqual({
      mode: 'update',
      cwd: resolve('/tmp/target'),
    });
  });

  it('returns help for -h and --help', () => {
    expect(parseOutdatedArgs(['-h'], DEFAULT_CWD)).toBe('help');
    expect(parseOutdatedArgs(['--help'], DEFAULT_CWD)).toBe('help');
  });

  it('documents default outdated, --update, and --cwd', () => {
    expect(OUTDATED_USAGE).toContain('bun outdated');
    expect(OUTDATED_USAGE).toContain('--update');
    expect(OUTDATED_USAGE).toContain('bun update --latest');
    expect(OUTDATED_USAGE).toContain('--cwd');
  });

  it('rejects unknown flags and positionals', () => {
    expect(() => parseOutdatedArgs(['--dry-run'], DEFAULT_CWD)).toThrow();
    expect(() => parseOutdatedArgs(['extra'], DEFAULT_CWD)).toThrow(/unexpected argument/);
  });
});

describe('listDependencyPackageRoots', () => {
  it('lists the repository and every preset pack with a lockfile', async () => {
    const roots = await listDependencyPackageRoots(REPO_ROOT);
    expect(roots[0]).toBe(REPO_ROOT);
    expect(roots.slice(1)).toEqual([
      join(REPO_ROOT, 'presets', 'bun-parse'),
      join(REPO_ROOT, 'presets', 'config'),
      join(REPO_ROOT, 'presets', 'database'),
      join(REPO_ROOT, 'presets', 'module-placement'),
      join(REPO_ROOT, 'presets', 'playwright'),
    ]);
  });

  it('includes the project root when it has package.json and a Bun lockfile', async () => {
    const root = await createTempRoot();
    await write(join(root, 'package.json'), '{}\n');
    await write(join(root, 'bun.lock'), '{}\n');

    expect(await listDependencyPackageRoots(root)).toEqual([root]);
  });

  it('includes preset packs that declare a manifest and Bun lockfile', async () => {
    const root = await createTempRoot();
    await write(join(root, 'package.json'), '{}\n');
    await write(join(root, 'bun.lock'), '{}\n');
    await write(join(root, 'presets', 'alpha', 'manifest.json'), '{}\n');
    await write(join(root, 'presets', 'alpha', 'package.json'), '{}\n');
    await write(join(root, 'presets', 'alpha', 'bun.lock'), '{}\n');
    await write(join(root, 'presets', 'beta', 'manifest.json'), '{}\n');
    await write(join(root, 'presets', 'beta', 'package.json'), '{}\n');

    expect(await listDependencyPackageRoots(root)).toEqual([root, join(root, 'presets', 'alpha')]);
  });

  it('returns an empty list when the cwd has no Bun package roots', async () => {
    const root = await createTempRoot();
    await write(join(root, 'package.json'), '{}\n');

    expect(await listDependencyPackageRoots(root)).toEqual([]);
  });
});
