import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  formatLocalPresetPacks,
  listLocalPresetPackFmtNames,
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
  const root = await mkdtemp(join(tmpdir(), 'aqg-pack-fmt-'));
  tempDirectories.push(root);
  await mkdir(join(root, 'presets'), { recursive: true });
  return root;
}

async function writePreset(
  projectRoot: string,
  name: string,
  options: { fmtScript?: string },
): Promise<void> {
  const presetRoot = join(projectRoot, 'presets', name);
  await mkdir(presetRoot, { recursive: true });
  await writeFile(join(presetRoot, 'manifest.json'), `${JSON.stringify({ name }, null, 2)}\n`);
  const scripts: Record<string, string> = {};
  if (options.fmtScript !== undefined) {
    scripts.fmt = options.fmtScript;
  }
  await writeFile(
    join(presetRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: `@fixture/${name}`,
        private: true,
        scripts,
      },
      null,
      2,
    )}\n`,
  );
}

describe('local preset pack fmt', () => {
  it('lists every in-repo preset package that declares a fmt script', () => {
    expect(listLocalPresetPackFmtNames(REPO_ROOT)).toEqual([
      'bun-parse',
      'config',
      'database',
      'module-placement',
      'playwright',
    ]);
  });

  it('passes when every pack fmt script succeeds', async () => {
    const root = await createTempProject();
    await writePreset(root, 'ok', { fmtScript: 'bun -e "process.exit(0)"' });

    const result = await formatLocalPresetPacks(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^fmt: ok pack ok \(\d+ms\)\n$/);
  });

  it('fails when a pack fmt script exits non-zero', async () => {
    const root = await createTempProject();
    await writePreset(root, 'broken', { fmtScript: 'bun -e "process.exit(5)"' });

    const result = await formatLocalPresetPacks(root);

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain('fmt: local preset "broken" failed pack fmt');
  });
});
