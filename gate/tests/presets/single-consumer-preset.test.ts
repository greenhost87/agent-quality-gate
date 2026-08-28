import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { writeTextFile } from '../../../process/files/files.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const FIXTURES_ROOT = join(import.meta.dir, 'fixtures', 'single-consumer-preset');

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function stageProject(fixtureName: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `aqg-single-consumer-${fixtureName}-`));
  tempDirectories.push(root);
  await writeTextFile(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'single-consumer-fixture', private: true, type: 'module' }, null, 2)}\n`,
  );
  await cp(join(FIXTURES_ROOT, fixtureName), root, { recursive: true });
  return root;
}

describe('single-consumer preset', () => {
  it('fails when a module has exactly one importer', async () => {
    const projectRoot = await stageProject('one-importer');
    const result = await executeVerify({
      projectRoot,
      entries: ['src/index.ts'],
      presets: ['single-consumer'],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('single-consumer:src/helper.ts (via src/caller.ts)');
    expect(result.stdout).toContain('single-consumer:src/caller.ts (via src/index.ts)');
  }, 60_000);

  it('passes when shared modules have two or more importers', async () => {
    const projectRoot = await stageProject('two-importers');
    const result = await executeVerify({
      projectRoot,
      entries: ['src/entry-a.ts', 'src/entry-b.ts'],
      presets: ['single-consumer'],
    });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  }, 60_000);
});
