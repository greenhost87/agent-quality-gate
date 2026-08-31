import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { listFallowDiscoveredFiles } from '../../../gate/preflight/fallow-analysis.js';
import {
  findTestColocationViolationsFromRelativePaths,
  rejectMisplacedTestsFromRelativePaths,
} from '../scan-test-colocation.ts';
import { fixturePath } from '../../../tests/support/fixture-files.js';

const FIXTURES_ROOT = join(import.meta.dir, '../.quality-fixtures');
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function materialize(caseName: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `test-colocation-${caseName}-`));
  tempDirectories.push(directory);
  await cp(fixturePath(FIXTURES_ROOT, caseName), directory, { recursive: true });
  return directory;
}

async function listFixtureFiles(root: string): Promise<readonly string[]> {
  const list = await listFallowDiscoveredFiles({ projectRoot: root });
  expect(list.ok).toBe(true);
  if (!list.ok) {
    return [];
  }
  return list.files;
}

describe('test-colocation scan', () => {
  it('rejects application test files outside tests/', async () => {
    const root = await materialize('invalid-application-colocated');
    const files = await listFixtureFiles(root);
    const result = rejectMisplacedTestsFromRelativePaths(files, 'application');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('system/workflows/draft/example.test.ts');
  });

  it('allows application tests and setup helpers under tests/', async () => {
    const root = await materialize('valid-application');
    const files = await listFixtureFiles(root);
    const result = rejectMisplacedTestsFromRelativePaths(files, 'application');
    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('finds violations from an explicit relative path list', async () => {
    const violations = findTestColocationViolationsFromRelativePaths(
      ['gate/example.test.ts'],
      'aqg-repository',
    );
    expect(violations).toEqual([
      {
        path: 'gate/example.test.ts',
        reason:
          'test and bench files must live under adapters/*/tests, scripts/tests, scripts/*/tests, gate/tests, presets/*/tests, or presets/*/examples/tests',
      },
    ]);
  });
});
