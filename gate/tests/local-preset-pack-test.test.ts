import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listLocalPresetPackIntegrationTestNames,
  listLocalPresetPackTestNames,
  testLocalPresetPackIntegrations,
  testLocalPresetPacks,
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
  const root = await mkdtemp(join(tmpdir(), 'aqg-pack-test-'));
  tempDirectories.push(root);
  await mkdir(join(root, 'presets'), { recursive: true });
  return root;
}

async function writePreset(
  projectRoot: string,
  name: string,
  options: { testScript?: string; integrationScript?: string },
): Promise<void> {
  const presetRoot = join(projectRoot, 'presets', name);
  await mkdir(presetRoot, { recursive: true });
  await writeFile(join(presetRoot, 'manifest.json'), `${JSON.stringify({ name }, null, 2)}\n`);
  const scripts: Record<string, string> = {};
  if (options.testScript !== undefined) {
    scripts.test = options.testScript;
  }
  if (options.integrationScript !== undefined) {
    scripts['test:integration'] = options.integrationScript;
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

describe('local preset pack test', () => {
  it('lists in-repo packs with test scripts except root-covered playwright', () => {
    expect(listLocalPresetPackTestNames(REPO_ROOT)).toEqual([
      'bun-parse',
      'config',
      'database',
      'module-placement',
    ]);
  });

  it('lists in-repo packs with test:integration scripts', () => {
    expect(listLocalPresetPackIntegrationTestNames(REPO_ROOT)).toEqual(['database']);
  });

  it('passes when every pack test script succeeds', async () => {
    const root = await createTempProject();
    await writePreset(root, 'ok', { testScript: 'bun -e "process.exit(0)"' });
    await writePreset(root, 'playwright', { testScript: 'bun -e "process.exit(1)"' });

    const result = await testLocalPresetPacks(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^test: ok pack ok \(\d+ms\)\n$/);
  });

  it('passes when every pack integration script succeeds', async () => {
    const root = await createTempProject();
    await writePreset(root, 'ok', { integrationScript: 'bun -e "process.exit(0)"' });
    await writePreset(root, 'skip', { testScript: 'bun -e "process.exit(1)"' });

    const result = await testLocalPresetPackIntegrations(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^test: ok pack ok integration \(\d+ms\)\n$/);
  });

  it('fails when a pack integration script exits non-zero', async () => {
    const root = await createTempProject();
    await writePreset(root, 'broken', { integrationScript: 'bun -e "process.exit(9)"' });

    const result = await testLocalPresetPackIntegrations(root);

    expect(result.exitCode).toBe(9);
    expect(result.stderr).toContain('test: local preset "broken" failed pack integration');
  });
});
