import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readTextFile } from '../../../process/files/files.js';

import { describe, expect, it } from 'bun:test';

import {
  followUpForSettledResult,
  VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS,
  VERIFY_FAILURE_LOG_RELATIVE_PATH,
} from '../../quality-gate-run/quality-gate-run.js';
import {
  PACKAGE_BOUNDARY_MESSAGE,
  makeTempDirectory,
  packageBoundaryDiagnostics,
} from './quality-gate-follow-up-support.js';

describe('followUpForSettledResult diagnostic spill', () => {
  it('groups adjacent diagnostics by severity and rule without merging across hints', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-grouped-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: packageBoundaryDiagnostics(),
        deferredCount: 16,
      },
    });
    expect(message).toContain('error packages/package-boundaries:');
    expect(message).toContain('app/tests/media/upload-from-app.test.ts:13:70');
    expect(message).toContain('warning packages/package-boundaries:');
    expect(message).toContain('error packages/other-rule:');
    expect(message).toContain('verify: deferred: 16');
    expect(message?.match(/error packages\/package-boundaries:/gu)?.length).toBe(1);
  });

  it('groups diagnostics with different messages by severity and rule', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-varied-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          {
            source: 'oxlint',
            ruleId: 'react-presentation/overridable-fixed-props',
            severity: 'error',
            message: 'Fixed wrapper props must follow the forwarded prop spread.',
            location: { path: 'app/one.tsx', line: 10, column: 20 },
          },
          {
            source: 'oxlint',
            ruleId: 'react-presentation/overridable-fixed-props',
            severity: 'error',
            message: 'Fixed wrapper props must follow the forwarded prop spread.',
            location: { path: 'app/two.tsx', line: 30, column: 40 },
          },
          {
            source: 'oxlint',
            ruleId: 'react-presentation/overridable-fixed-props',
            severity: 'error',
            message: 'Fixed wrapper props must follow the forwarded prop spread.',
            location: { path: 'app/three.tsx', line: 50, column: 60 },
          },
        ],
      },
    });
    expect(message).toContain('error react-presentation/overridable-fixed-props:');
    expect(message).toContain('app/one.tsx:10:20');
    expect(message).toContain('app/two.tsx:30:40');
    expect(message).toContain('app/three.tsx:50:60');
    expect(message?.match(/react-presentation\/overridable-fixed-props/gu)?.length).toBe(1);
  });

  it('groups fallow unresolved-imports by missing target', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-unresolved-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          {
            source: 'fallow',
            ruleId: 'unresolved-import',
            severity: 'error',
            message: './missing-lib',
            location: { path: 'app/a.ts', line: 4 },
            groupHeader: 'unresolved-import:./missing-lib',
          },
          {
            source: 'fallow',
            ruleId: 'unresolved-import',
            severity: 'error',
            message: './missing-lib',
            location: { path: 'app/b.ts', line: 8 },
            groupHeader: 'unresolved-import:./missing-lib',
          },
          {
            source: 'fallow',
            ruleId: 'unresolved-import',
            severity: 'error',
            message: './other-lib',
            location: { path: 'app/c.ts', line: 2 },
            groupHeader: 'unresolved-import:./other-lib',
          },
        ],
      },
    });
    expect(message).toContain('unresolved-import:./missing-lib');
    expect(message).toContain('app/a.ts:4');
    expect(message).toContain('app/b.ts:8');
    expect(message).toContain('unresolved-import:./other-lib');
    expect(message).toContain('app/c.ts:2');
  });

  it('groups layout placement capacity violations by limit and root', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-placement-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          {
            source: 'layout',
            ruleId: 'layout/placement',
            severity: 'error',
            message:
              'per-directory limit 12 under app/components/features; split the directory by concern',
            location: { path: 'app/components/features/fabrics' },
            groupHeader:
              'layout/placement: per-directory limit 12 under app/components/features; split the directory by concern',
          },
          {
            source: 'layout',
            ruleId: 'layout/placement',
            severity: 'error',
            message:
              'per-directory limit 12 under app/components/features; split the directory by concern',
            location: { path: 'app/components/features/mailings' },
            groupHeader:
              'layout/placement: per-directory limit 12 under app/components/features; split the directory by concern',
          },
        ],
      },
    });
    expect(message).toContain(
      'layout/placement: per-directory limit 12 under app/components/features; split the directory by concern',
    );
    expect(message).toContain(
      'per-directory limit 12 under app/components/features; split the directory by concern',
    );
    expect(message?.match(/per-directory limit 12/gu)?.length).toBeGreaterThanOrEqual(1);
  });

  it('applies the character limit after grouping', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-grouped-spill-');
    const diagnostics = Array.from({ length: 51 }, (_, index) => ({
      source: 'oxlint',
      ruleId: 'packages/package-boundaries',
      severity: 'error' as const,
      message: PACKAGE_BOUNDARY_MESSAGE,
      location: {
        path: 'app/tests/media/upload-from-app.test.ts',
        line: index + 1,
        column: 70,
      },
    }));
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, diagnostics },
    });
    expect(message).not.toContain(VERIFY_FAILURE_LOG_RELATIVE_PATH);
    expect(message?.match(/Production modules must not import/gu)?.length).toBe(1);
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(false);
  });

  it('stores all grouped diagnostics while limiting the grouped preview in characters', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-grouped-large-');
    const diagnostics = Array.from({ length: 80 }, (_, index) => ({
      source: 'oxlint',
      ruleId: `packages/rule-${String(index)}`,
      severity: 'error' as const,
      message: `Finding number ${String(index)} with enough text to force spill across many distinct diagnostic blocks for the character budget.`,
      location: { path: `app/file-${String(index)}.ts`, line: 1, column: 1 },
    }));
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, diagnostics },
    });
    const marker = `other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`;
    expect(message?.endsWith(marker)).toBe(true);
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(true);
    expect(message).not.toContain('characters');
    const logged = await readTextFile(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH));
    expect(logged.length).toBeGreaterThan(0);
  });

  it('keeps diagnostics exactly at the character limit in-band without writing a log file', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-short-');
    const opaqueText = 'x'.repeat(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS);
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, diagnostics: [], opaqueText },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message.endsWith(opaqueText)).toBe(true);
    expect(message).not.toContain(VERIFY_FAILURE_LOG_RELATIVE_PATH);
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(false);
  });

  it('spills oversized opaque text only when diagnostic blocks exceed the budget', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-spill-');
    const head = 'x'.repeat(200);
    const diagnostics = Array.from({ length: 60 }, (_, index) => ({
      source: 'oxlint',
      ruleId: `packages/spill-${String(index)}`,
      severity: 'error' as const,
      message: `${head} finding ${String(index)}`,
      location: { path: `app/spill-${String(index)}.ts`, line: 1, column: 1 },
    }));
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, diagnostics },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain(`other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`);
    expect(message).not.toContain(projectRoot);
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(true);
  });
});
