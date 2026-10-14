import { existsSync } from 'node:fs';

import { join } from 'node:path';
import { readTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';

import { followUpForSettledResult } from '#system/gate/quality-gate-run/quality-gate-run.ts';
import { VERIFY_FAILURE_MAX_LINES } from '#system/gate/quality-gate-run/present-verify-failure.ts';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { makeTempDirectory } = useTrackedTempDirectories();
const FIXTURES_ROOT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures',
  'quality-gate-follow-up',
);

async function captureHintError(
  projectRoot: string,
  hint:
    | { kind: 'builtin'; id: string }
    | { kind: 'document'; id: string; owner: string; body: string },
): Promise<unknown> {
  try {
    await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          { source: 'sample', severity: 'error', message: 'sample-check:src/helper.ts' },
        ],
        hints: [hint],
      },
    });
  } catch (error) {
    return error;
  }
  return undefined;
}

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
          { kind: 'builtin', id: 'code-duplication' },
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
    expect(message).toContain('hint:code-duplication');
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
    expect(existsSync(join(projectRoot, '.aqg', 'hints', 'code-duplication.md'))).toBe(true);
  });

  it('passes unknown builtin ids through without core-owned materialization and rejects unsafe document ids', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-bad-hints-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [{ source: 'sample', severity: 'error', message: 'sample-check' }],
        hints: [{ kind: 'builtin', id: 'preset-owned-hint' }],
      },
    });
    expect(message).toContain('hint:preset-owned-hint');
    expect(existsSync(join(projectRoot, '.aqg', 'hints', 'preset-owned-hint.md'))).toBe(false);

    const unsafeIdError = await captureHintError(projectRoot, {
      kind: 'document',
      id: '../escape',
      owner: 'optional-alpha',
      body: '# bad\n',
    });
    expect(String(unsafeIdError)).toMatch(/unsafe/);
  });

  it('keeps structured hints visible when diagnostics are spilled', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-spill-hints-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        opaqueText: Array.from({ length: VERIFY_FAILURE_MAX_LINES }, () => 'x').join(
          String.fromCharCode(10),
        ),
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
          { kind: 'builtin', id: 'code-duplication' },
          { kind: 'builtin', id: 'database-boundary' },
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
