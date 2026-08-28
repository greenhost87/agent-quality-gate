import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { rejectCrossPresetImports } from '../../../scripts/self-verify/preset-isolation.js';
import { fixturePath } from '../../../tests/support/fixture-files.js';

const FIXTURES_ROOT = join(import.meta.dir, '../..', '.quality-fixtures', 'local-preset-isolation');
const tempDirectories: string[] = [];

async function materializeFixture(caseName: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `aqg-preset-isolation-${caseName}-`));
  tempDirectories.push(directory);
  await cp(fixturePath(FIXTURES_ROOT, caseName), directory, { recursive: true });
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('local preset isolation', () => {
  it('rejects relative imports from one preset into another', async () => {
    const root = await materializeFixture('invalid');
    const result = rejectCrossPresetImports(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('preset-isolation:');
    expect(result.stderr).toContain('presets/alpha/check.ts');
    expect(result.stderr).toContain('presets/beta/helper.ts');
  });

  it('allows imports within a preset', async () => {
    const root = await materializeFixture('valid');
    const result = rejectCrossPresetImports(root);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('ignores quality fixtures when scanning for cross-preset imports', async () => {
    const root = await materializeFixture('fixtures-only');
    const result = rejectCrossPresetImports(root);
    expect(result.exitCode).toBe(0);
  });
});
