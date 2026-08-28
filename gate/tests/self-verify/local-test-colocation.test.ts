import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { rejectMisplacedTests } from '../../../scripts/self-verify/test-colocation.js';
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

describe('local test colocation', () => {
  it('rejects test files dumped in top-level tests/', async () => {
    const root = await materialize('invalid-top-level');
    const result = rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('test-colocation:');
    expect(result.stderr).toContain('tests/example.test.ts');
  });

  it('rejects test files outside owner tests directories', async () => {
    const root = await materialize('invalid-loose');
    const result = rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('gate/example.test.ts');
  });

  it('rejects bench files outside owner tests directories', async () => {
    const root = await materialize('invalid-bench-loose');
    const result = rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('gate/example.bench.ts');
  });

  it('allows colocated owner tests, preset example tests, and shared support helpers', async () => {
    const root = await materialize('valid');
    const result = rejectMisplacedTests(root);
    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('rejects database setup files under tests/setup/', async () => {
    const root = await materialize('invalid-setup');
    const result = rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('tests/setup/helper.ts');
    expect(result.stderr).toContain(
      'top-level tests/ may only hold shared helpers under tests/support/',
    );
  });

  it('rejects managed *.example files directly under tests/', async () => {
    const root = await materialize('invalid-example');
    const result = rejectMisplacedTests(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('tests/database.integration.test.ts.example');
    expect(result.stderr).toContain(
      'top-level tests/ may only hold shared helpers under tests/support/',
    );
  });
});
