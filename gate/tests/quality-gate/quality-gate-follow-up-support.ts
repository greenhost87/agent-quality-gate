import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'bun:test';

import { readFixture } from '../../../tests/support/fixture-files.js';
import type { Diagnostic } from '../../execute-verify/check-result.js';

export const tempDirectories: string[] = [];
export const FIXTURES_ROOT = join(
  import.meta.dir,
  '../..',
  '.quality-fixtures',
  'quality-gate-follow-up',
);
export const baseFollowUp = (await readFixture(FIXTURES_ROOT, 'base.txt')).trimEnd();

export const PACKAGE_BOUNDARY_MESSAGE =
  'Production modules must not import test modules under tests/.';

export function diagnosticsFromHintFixture(name: string, text: string): Diagnostic[] {
  if (name === 'compact-fallow') {
    return [
      {
        source: 'fallow',
        ruleId: 'dev-dep-in-prod',
        severity: 'error',
        message: 'node-pg-migrate',
      },
      {
        source: 'fallow',
        ruleId: 'code-duplication',
        severity: 'error',
        message: text.split('\n').find((line) => line.startsWith('code-duplication:')) ?? text,
        location: { path: 'system/database/phases/phases.dao.ts', line: 15 },
      },
    ];
  }
  if (name === 'playwright-e2e') {
    return [
      {
        source: 'playwright',
        ruleId: 'playwright/e2e-runner',
        severity: 'error',
        message: text.trim(),
      },
    ];
  }
  if (name === 'database-boundary') {
    return [
      {
        source: 'database',
        ruleId: 'database/dao-boundaries',
        severity: 'error',
        message: text.trim(),
      },
    ];
  }
  if (name === 'committed-migration') {
    return [
      {
        source: 'database',
        ruleId: 'database-committed-migration',
        severity: 'error',
        message: text.trim(),
      },
    ];
  }
  if (name === 'handmade-json' || name === 'raw-json-parse' || name === 'typeof-object') {
    const ruleId =
      name === 'handmade-json'
        ? 'bun-parse/no-handmade-json-types'
        : name === 'raw-json-parse'
          ? 'bun-parse/no-raw-json-parse'
          : 'bun-parse/no-typeof-object';
    return [{ source: 'oxlint', ruleId, severity: 'error', message: text.trim() }];
  }
  if (name === 'thin-forwarders' || name === 'trivial-const-wrappers') {
    const ruleId =
      name === 'thin-forwarders' ? 'aqg/no-thin-forwarders' : 'aqg/no-trivial-const-wrappers';
    return [{ source: 'oxlint', ruleId, severity: 'error', message: text.trim() }];
  }
  return [{ source: 'test', severity: 'error', message: text.trim() }];
}

export function packageBoundaryDiagnostics(): Diagnostic[] {
  return [
    {
      source: 'oxlint',
      ruleId: 'packages/package-boundaries',
      severity: 'error',
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: { path: 'app/tests/media/upload-from-app.test.ts', line: 13, column: 70 },
    },
    {
      source: 'oxlint',
      ruleId: 'packages/package-boundaries',
      severity: 'error',
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: { path: 'app/tests/app/api/telegram/admin-login.test.ts', line: 15, column: 70 },
    },
    {
      source: 'oxlint',
      ruleId: 'packages/package-boundaries',
      severity: 'error',
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: { path: 'app/tests/fabrics/fabric-list-queries.test.ts', line: 4, column: 70 },
    },
    {
      source: 'oxlint',
      ruleId: 'packages/package-boundaries',
      severity: 'error',
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: { path: 'app/tests/fabrics/fabric-list-queries.test.ts', line: 11, column: 8 },
    },
    {
      source: 'oxlint',
      ruleId: 'packages/package-boundaries',
      severity: 'error',
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: { path: 'app/tests/fabrics/fabric-list-queries.test.ts', line: 13, column: 35 },
    },
    {
      source: 'oxlint',
      ruleId: 'packages/package-boundaries',
      severity: 'warning',
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: { path: 'app/one.ts', line: 1, column: 2 },
    },
    {
      source: 'oxlint',
      ruleId: 'packages/other-rule',
      severity: 'error',
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: { path: 'app/two.ts', line: 1, column: 2 },
    },
    {
      source: 'oxlint',
      ruleId: 'packages/other-rule',
      severity: 'error',
      message: 'Different message.',
      location: { path: 'app/three.ts', line: 1, column: 2 },
      help: 'Keep this attached to app/three.ts.',
    },
    {
      source: 'oxlint',
      ruleId: 'packages/other-rule',
      severity: 'error',
      message: 'Different message.',
      location: { path: 'app/four.ts', line: 1, column: 2 },
    },
  ];
}

export async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});
