import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { listFallowDiscoveredFiles } from '../../../gate/preflight/fallow-analysis.js';
import { formatVerifyResultDiagnostics } from '../../../gate/quality-gate-run/format-diagnostics.js';
import {
  rejectMisplacedTestsFromRelativePaths,
  type TestColocationPolicy,
} from '../../../presets/test-colocation/scan-test-colocation.js';
import { fixturePath } from '../../../tests/support/fixture-files.js';

const FIXTURES_ROOT = join(import.meta.dir, '../..', '.quality-fixtures', 'local-test-colocation');
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function materialize(caseName: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `aqg-test-colocation-${caseName}-`));
  tempDirectories.push(directory);
  await cp(fixturePath(FIXTURES_ROOT, caseName), directory, { recursive: true });
  return directory;
}

async function rejectMisplacedTests(root: string, policy: TestColocationPolicy = 'aqg-repository') {
  const list = await listFallowDiscoveredFiles({ projectRoot: root });
  expect(list.ok).toBe(true);
  if (!list.ok) {
    return list.result;
  }
  return rejectMisplacedTestsFromRelativePaths(list.files, policy);
}

describe('local test colocation', () => {
  it('rejects test files dumped in top-level tests/', async () => {
    const root = await materialize('invalid-top-level');
    const result = await rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(formatVerifyResultDiagnostics(result)).toContain('test-colocation');
    expect(formatVerifyResultDiagnostics(result)).toContain('tests/example.test.ts');
  });

  it('rejects test files outside owner tests directories', async () => {
    const root = await materialize('invalid-loose');
    const result = await rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(formatVerifyResultDiagnostics(result)).toContain('gate/example.test.ts');
  });

  it('rejects bench files outside owner tests directories', async () => {
    const root = await materialize('invalid-bench-loose');
    const result = await rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(formatVerifyResultDiagnostics(result)).toContain('gate/example.bench.ts');
  });

  it('allows colocated owner tests, preset example tests, and shared support helpers', async () => {
    const root = await materialize('valid');
    const result = await rejectMisplacedTests(root);
    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
  });

  it('rejects application test files outside tests/', async () => {
    const root = await materialize('invalid-application-colocated');
    const result = await rejectMisplacedTests(root, 'application');
    expect(result.exitCode).toBe(1);
    expect(formatVerifyResultDiagnostics(result)).toContain(
      'system/workflows/draft/example.test.ts',
    );
    expect(formatVerifyResultDiagnostics(result)).toContain(
      'test and bench files must live under tests/',
    );
  });

  it('allows application tests and setup helpers under tests/', async () => {
    const root = await materialize('valid-application');
    const result = await rejectMisplacedTests(root, 'application');
    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
  });

  it('rejects database setup files under tests/setup/', async () => {
    const root = await materialize('invalid-setup');
    const result = await rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(formatVerifyResultDiagnostics(result)).toContain('tests/setup/helper.ts');
    expect(formatVerifyResultDiagnostics(result)).toContain(
      'top-level tests/ may only hold shared helpers under tests/support/',
    );
  });

  it('rejects non-support helpers directly under tests/', async () => {
    const root = await materialize('invalid-example');
    const result = await rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(formatVerifyResultDiagnostics(result)).toContain('tests/database.integration.ts');
    expect(formatVerifyResultDiagnostics(result)).toContain(
      'top-level tests/ may only hold shared helpers under tests/support/',
    );
  });
});
