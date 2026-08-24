import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  bunDependencyArgs,
  listDependencyPackageRoots,
  OUTDATED_USAGE,
  parseOutdatedArgs,
} from '../../scripts/outdated/outdated.js';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const tempDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirectories.map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function createTempProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aqg-outdated-'));
  tempDirectories.push(root);
  await mkdir(join(root, 'presets'), { recursive: true });
  return root;
}

async function writePackageRoot(
  directory: string,
  options: { lockfile?: boolean; packageJson?: boolean } = {},
): Promise<void> {
  await mkdir(directory, { recursive: true });
  if (options.packageJson !== false) {
    await writeFile(
      join(directory, 'package.json'),
      `${JSON.stringify({ name: 'fixture', private: true }, null, 2)}\n`,
    );
  }
  if (options.lockfile !== false) {
    await writeFile(join(directory, 'bun.lock'), '{}\n');
  }
}

async function writePreset(
  projectRoot: string,
  name: string,
  options: { lockfile?: boolean; packageJson?: boolean } = {},
): Promise<void> {
  const presetRoot = join(projectRoot, 'presets', name);
  await writePackageRoot(presetRoot, options);
  await writeFile(join(presetRoot, 'manifest.json'), `${JSON.stringify({ name }, null, 2)}\n`);
}

describe('local outdated', () => {
  it('defaults to outdated and accepts --update', () => {
    expect(parseOutdatedArgs([])).toEqual({ mode: 'outdated' });
    expect(parseOutdatedArgs(['--update'])).toEqual({ mode: 'update' });
  });

  it('returns help for -h and --help', () => {
    expect(parseOutdatedArgs(['-h'])).toBe('help');
    expect(parseOutdatedArgs(['--help'])).toBe('help');
  });

  it('rejects unexpected arguments', () => {
    expect(() => parseOutdatedArgs(['--latest'])).toThrow(/unexpected argument/);
    expect(() => parseOutdatedArgs(['update'])).toThrow(/unexpected argument/);
  });

  it('documents default outdated and --update', () => {
    expect(OUTDATED_USAGE).toContain('bun outdated');
    expect(OUTDATED_USAGE).toContain('--update');
    expect(OUTDATED_USAGE).toContain('bun update --latest');
  });

  it('maps modes to bun outdated and bun update --latest', () => {
    expect(bunDependencyArgs('outdated')).toEqual(['outdated']);
    expect(bunDependencyArgs('update')).toEqual(['update', '--latest']);
  });

  it('lists the repository and every preset pack with a lockfile', () => {
    const roots = listDependencyPackageRoots(REPO_ROOT);
    expect(roots[0]).toBe(REPO_ROOT);
    expect(roots.slice(1)).toEqual([
      join(REPO_ROOT, 'presets', 'bun-parse'),
      join(REPO_ROOT, 'presets', 'config'),
      join(REPO_ROOT, 'presets', 'database'),
      join(REPO_ROOT, 'presets', 'module-placement'),
      join(REPO_ROOT, 'presets', 'playwright'),
    ]);
  });

  it('skips roots without package.json or a bun lockfile', async () => {
    const root = await createTempProject();
    await writePackageRoot(root);
    await writePreset(root, 'with-lock');
    await writePreset(root, 'no-lock', { lockfile: false });
    await writePreset(root, 'no-package', { packageJson: false });

    expect(listDependencyPackageRoots(root)).toEqual([root, join(root, 'presets', 'with-lock')]);
  });
});
