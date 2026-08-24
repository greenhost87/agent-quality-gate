import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listLocalPresetPackVerifyNames,
  verifyLocalPresetPacks,
} from '../../scripts/self-verify/preset-pack-run.js';

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
  const root = await mkdtemp(join(tmpdir(), 'aqg-pack-verify-'));
  tempDirectories.push(root);
  await mkdir(join(root, 'presets'), { recursive: true });
  return root;
}

async function writePreset(
  projectRoot: string,
  name: string,
  options: { packageJson?: object; verifyScript?: string },
): Promise<string> {
  const presetRoot = join(projectRoot, 'presets', name);
  await mkdir(presetRoot, { recursive: true });
  await writeFile(join(presetRoot, 'manifest.json'), `${JSON.stringify({ name }, null, 2)}\n`);
  if (options.packageJson !== undefined || options.verifyScript !== undefined) {
    const packageJson = options.packageJson ?? {
      name: `@fixture/${name}`,
      private: true,
      scripts: options.verifyScript === undefined ? {} : { verify: options.verifyScript },
    };
    await writeFile(join(presetRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  return presetRoot;
}

describe('local preset pack verify', () => {
  it('lists every in-repo preset package that declares a verify script', () => {
    expect(listLocalPresetPackVerifyNames(REPO_ROOT)).toEqual([
      'bun-parse',
      'config',
      'database',
      'module-placement',
      'playwright',
    ]);
  });

  it('skips manifest-only presets and packages without a verify script', async () => {
    const root = await createTempProject();
    await writePreset(root, 'baseline', {});
    await writePreset(root, 'alpha', { verifyScript: 'bun -e "process.exit(0)"' });
    await writePreset(root, 'beta', {
      packageJson: { name: '@fixture/beta', private: true, scripts: { test: 'bun test' } },
    });

    expect(listLocalPresetPackVerifyNames(root)).toEqual(['alpha']);
  });

  it('fails when a pack verify script exits non-zero', async () => {
    const root = await createTempProject();
    await writePreset(root, 'broken', { verifyScript: 'bun -e "process.exit(7)"' });

    const result = await verifyLocalPresetPacks(root);

    expect(result.exitCode).toBe(7);
    expect(result.stderr).toContain('verify: local preset "broken" failed pack verify');
  });

  it('passes when every pack verify script succeeds', async () => {
    const root = await createTempProject();
    await writePreset(root, 'ok', { verifyScript: 'bun -e "process.exit(0)"' });

    const result = await verifyLocalPresetPacks(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^verify: ok pack ok \(\d+ms\)\n$/);
    expect(result.stderr).toBe('');
  });
});
