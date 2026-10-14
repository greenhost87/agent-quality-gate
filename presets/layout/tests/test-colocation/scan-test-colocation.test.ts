import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { listFallowDiscoveredFiles } from 'agent-quality-gate/shared/verify';
import {
  findTestColocationViolationsFromRelativePaths,
  rejectMisplacedTestsFromRelativePaths,
  type TestColocationPolicy,
} from 'agent-quality-gate/internal/presets/layout/scan-test-colocation.ts';

const FIXTURES_ROOT = join(import.meta.dir, '../../.quality-fixtures/test-colocation');
const LOCAL_FIXTURES_ROOT = join(import.meta.dir, '../../.quality-fixtures/local-test-colocation');
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function materialize(caseName: string, fixtureRoot = FIXTURES_ROOT): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `test-colocation-${caseName}-`));
  tempDirectories.push(directory);
  await cp(join(fixtureRoot, caseName), directory, { recursive: true });
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

async function expectRejectedFixture(
  caseName: string,
  expected: readonly string[],
  policy: TestColocationPolicy = 'aqg-repository',
): Promise<void> {
  const root = await materialize(caseName, LOCAL_FIXTURES_ROOT);
  const files = await listFixtureFiles(root);
  const result = rejectMisplacedTestsFromRelativePaths(files, policy);
  expect(result.exitCode).toBe(1);
  const text = result.diagnostics
    .map((diagnostic) =>
      [diagnostic.ruleId, diagnostic.location?.path, diagnostic.message].join(' '),
    )
    .join('\n');
  for (const message of expected) {
    expect(text).toContain(message);
  }
}

describe('local test colocation', () => {
  it('rejects test files dumped in top-level tests/', async () => {
    await expectRejectedFixture('invalid-top-level', [
      'layout/test-colocation',
      'tests/example.test.ts',
    ]);
  });

  it('rejects test files outside owner tests directories', async () => {
    await expectRejectedFixture('invalid-loose', ['gate/example.test.ts']);
  });

  it('rejects bench files outside owner tests directories', async () => {
    await expectRejectedFixture('invalid-bench-loose', ['gate/example.bench.ts']);
  });

  it('allows colocated owner tests and preset example tests', async () => {
    const root = await materialize('valid', LOCAL_FIXTURES_ROOT);
    const files = await listFixtureFiles(root);
    expect(rejectMisplacedTestsFromRelativePaths(files)).toEqual({ exitCode: 0, diagnostics: [] });
  });

  it('rejects application test files outside tests/', async () => {
    await expectRejectedFixture(
      'invalid-application-colocated',
      ['system/workflows/draft/example.test.ts', 'test and bench files must live under tests/'],
      'application',
    );
  });

  it('allows application tests and setup helpers under tests/', async () => {
    const root = await materialize('valid-application', LOCAL_FIXTURES_ROOT);
    const files = await listFixtureFiles(root);
    expect(rejectMisplacedTestsFromRelativePaths(files, 'application')).toEqual({
      exitCode: 0,
      diagnostics: [],
    });
  });

  it('rejects database setup files under tests/setup/', async () => {
    await expectRejectedFixture('invalid-setup', [
      'tests/setup/helper.ts',
      'AQG shared test helpers belong under system/tests/support/',
    ]);
  });

  it('rejects non-support helpers directly under tests/', async () => {
    await expectRejectedFixture('invalid-example', [
      'tests/database.integration.ts',
      'AQG shared test helpers belong under system/tests/support/',
    ]);
  });
});

describe('test-colocation scan', () => {
  it('accepts centralized system tests and rejects their former locations', () => {
    expect(
      findTestColocationViolationsFromRelativePaths(
        ['system/tests/gate/verify.test.ts', 'system/tests/oxlint/rule-bench/bench.test.ts'],
        'aqg-repository',
      ),
    ).toEqual([]);
    expect(
      findTestColocationViolationsFromRelativePaths(
        [
          'system/gate/tests/verify.test.ts',
          'system/scripts/oxlint-ast-bench/tests/bench.test.ts',
          'tests/system/gate/verify.test.ts',
          'tests/system/scripts/oxlint-ast-bench/bench.test.ts',
        ],
        'aqg-repository',
      ),
    ).toHaveLength(4);
  });
  it('rejects application test files outside tests/', async () => {
    const root = await materialize('invalid-application-colocated');
    const files = await listFixtureFiles(root);
    const result = rejectMisplacedTestsFromRelativePaths(files, 'application');
    expect(result.exitCode).toBe(1);
    expect(
      result.diagnostics.some((entry) => entry.location?.path?.includes('example.test.ts')),
    ).toBe(true);
  });

  it('discovers misplaced tests when the gate enables Fallow production mode', async () => {
    const root = await materialize('invalid-application-colocated');
    const configPath = join(root, 'fallow.json');
    await writeFile(
      configPath,
      `${JSON.stringify({ entry: ['system/**/*.ts'], production: { deadCode: true } })}\n`,
    );

    const list = await listFallowDiscoveredFiles({
      projectRoot: root,
      fallowConfigPath: configPath,
    });
    expect(list.ok).toBe(true);
    if (!list.ok) {
      return;
    }
    expect(list.files.some((path) => path.endsWith('example.test.ts'))).toBe(true);
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

  it('requires repository shared helpers to live under system/', () => {
    const violations = findTestColocationViolationsFromRelativePaths(
      [
        'presets/layout/tests/login.pw.ts',
        'system/tests/support/login.helpers.ts',
        'tests/support/login.helpers.ts',
      ],
      'aqg-repository',
    );
    expect(violations).toEqual([
      {
        path: 'tests/support/login.helpers.ts',
        reason: 'AQG shared test helpers belong under system/tests/support/',
      },
    ]);
  });

  it('finds violations from an explicit relative path list', async () => {
    const violations = findTestColocationViolationsFromRelativePaths(
      ['system/gate/example.test.ts', 'tests/system/gate/example.test.ts'],
      'aqg-repository',
    );
    expect(violations).toEqual([
      {
        path: 'system/gate/example.test.ts',
        reason:
          'test and bench files must live under adapters/*/tests, system/tests/*, presets/*/tests, or presets/*/examples/tests',
      },
      {
        path: 'tests/system/gate/example.test.ts',
        reason:
          'test and bench files must live under adapters/*/tests, system/tests/*, presets/*/tests, or presets/*/examples/tests',
      },
    ]);
  });
});
