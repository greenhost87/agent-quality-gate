import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { listFallowDiscoveredFiles } from '../../../../gate/preflight/fallow-analysis.js';
import {
  findTestColocationViolationsFromRelativePaths,
  rejectMisplacedTestsFromRelativePaths,
} from '../../scan-test-colocation.ts';
import { fixturePath } from '../../../../tests/support/fixture-files.js';

const FIXTURES_ROOT = join(import.meta.dir, '../../.quality-fixtures/test-colocation');
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
    expect(
      result.diagnostics.some((entry) => entry.location?.path?.includes('example.test.ts')),
    ).toBe(true);
  });

  it('allows application tests and setup helpers under tests/', async () => {
    const root = await materialize('valid-application');
    const files = await listFixtureFiles(root);
    const result = rejectMisplacedTestsFromRelativePaths(files, 'application');
    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
  });

  it('allows Playwright tests under tests/ without relaxing helper placement', () => {
    const violations = findTestColocationViolationsFromRelativePaths(
      [
        'tests/e2e/login.pw.ts',
        'tests/e2e/login.helpers.ts',
        'tests/e2e/login.pw.helpers.ts',
        'tests/support/login.helpers.ts',
        'tests/setup/login-seed.ts',
      ],
      'application',
    );
    expect(violations).toEqual([
      {
        path: 'tests/e2e/login.helpers.ts',
        reason: 'top-level tests/ may only hold helpers under tests/support/ or tests/setup/',
      },
      {
        path: 'tests/e2e/login.pw.helpers.ts',
        reason: 'top-level tests/ may only hold helpers under tests/support/ or tests/setup/',
      },
    ]);
  });

  it('rejects Playwright tests outside application tests/ including support-like paths', () => {
    const violations = findTestColocationViolationsFromRelativePaths(
      ['app/login.pw.ts', 'system/tests/login.pw.ts'],
      'application',
    );
    expect(violations).toEqual([
      { path: 'app/login.pw.ts', reason: 'test and bench files must live under tests/' },
      { path: 'system/tests/login.pw.ts', reason: 'test and bench files must live under tests/' },
    ]);
  });

  it('enforces repository ownership for Playwright tests even under shared support', () => {
    const violations = findTestColocationViolationsFromRelativePaths(
      ['presets/layout/tests/login.pw.ts', 'tests/support/login.pw.ts'],
      'aqg-repository',
    );
    expect(violations).toEqual([
      {
        path: 'tests/support/login.pw.ts',
        reason: 'top-level tests/ may only hold shared helpers under tests/support/',
      },
    ]);
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
