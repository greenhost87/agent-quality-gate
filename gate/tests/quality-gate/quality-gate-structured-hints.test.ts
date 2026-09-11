import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  followUpForSettledResult,
  VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS,
} from '../../quality-gate-run/quality-gate-run.js';
import { readFixture } from '../../../tests/support/fixture-files.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '../..', '.quality-fixtures', 'quality-gate-follow-up');

async function makeTempDirectory(prefix: string): Promise<string> {
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

describe('followUpForSettledResult structured hints', () => {
  it('materializes structured document and builtin hints from the selected result', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-structured-hints-');
    const body = await readFixture(FIXTURES_ROOT, 'sample-check-hint.md');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          {
            source: 'sample',
            ruleId: 'sample-check',
            severity: 'error',
            message: 'helper should fold',
            location: { path: 'src/helper.ts' },
          },
        ],
        hints: [
          {
            kind: 'document',
            id: 'sample-check',
            owner: 'optional-alpha',
            body,
          },
          { kind: 'builtin', id: 'avoid-micro-splits' },
          {
            kind: 'document',
            id: 'sample-check',
            owner: 'optional-alpha',
            body,
          },
        ],
      },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain(
      'hint:sample-check — .aqg/hints/presets/optional-alpha/sample-check.md',
    );
    expect(message).toContain('hint:avoid-micro-splits');
    expect(
      message.match(/hint:sample-check — \.aqg\/hints\/presets\/optional-alpha\/sample-check\.md/g)
        ?.length,
    ).toBe(1);
    const documentPath = join(
      projectRoot,
      '.aqg',
      'hints',
      'presets',
      'optional-alpha',
      'sample-check.md',
    );
    expect(existsSync(documentPath)).toBe(true);
    expect(await readTextFile(documentPath)).toContain('Fold the helper');
    expect(existsSync(join(projectRoot, '.aqg', 'hints', 'avoid-micro-splits.md'))).toBe(true);
  });

  it('rejects unknown builtin ids and unsafe document ids', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-bad-hints-');
    let unknownBuiltinError: unknown;
    try {
      await followUpForSettledResult({
        kind: 'ran',
        projectRoot,
        result: {
          exitCode: 1,
          diagnostics: [
            {
              source: 'sample',
              severity: 'error',
              message: 'sample-check:src/helper.ts',
            },
          ],
          hints: [{ kind: 'builtin', id: 'not-a-real-hint' }],
        },
      });
    } catch (error) {
      unknownBuiltinError = error;
    }
    expect(String(unknownBuiltinError)).toMatch(/unknown builtin hint id/);

    let unsafeIdError: unknown;
    try {
      await followUpForSettledResult({
        kind: 'ran',
        projectRoot,
        result: {
          exitCode: 1,
          diagnostics: [
            {
              source: 'sample',
              severity: 'error',
              message: 'sample-check:src/helper.ts',
            },
          ],
          hints: [
            {
              kind: 'document',
              id: '../escape',
              owner: 'optional-alpha',
              body: '# bad\n',
            },
          ],
        },
      });
    } catch (error) {
      unsafeIdError = error;
    }
    expect(String(unsafeIdError)).toMatch(/unsafe/);
  });

  it('keeps structured hints visible when diagnostics are spilled', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-spill-hints-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        opaqueText: 'x'.repeat(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS),
        diagnostics: [
          {
            source: 'fallow',
            ruleId: 'code-duplication',
            severity: 'error',
            message: 'Duplication (3.0%) exceeds threshold (0.1%)',
            location: { path: 'system/database/phases/phases.dao.ts', line: 15 },
            groupHeader: 'code-duplication',
          },
          {
            source: 'database',
            ruleId: 'database/test-database-boundaries',
            severity: 'error',
            message: 'Import only useIsolatedTestDatabase from tests/setup/testDatabase.ts.',
            location: { path: 'tests/orders.test.ts', line: 1, column: 1 },
          },
        ],
        hints: [
          {
            kind: 'document',
            id: 'sample-check',
            owner: 'optional-alpha',
            body: await readFixture(FIXTURES_ROOT, 'sample-check-spill-hint.md'),
          },
        ],
      },
    });
    expect(message).toContain('hint:code-duplication');
    expect(message).toContain('hint:database-boundary');
    expect(message).toContain(
      'hint:sample-check — .aqg/hints/presets/optional-alpha/sample-check.md',
    );
  });
});
