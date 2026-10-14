import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';

import {
  followUpForSettledResult,
  VERIFY_FAILURE_LOG_RELATIVE_PATH,
} from '#system/gate/quality-gate-run/quality-gate-run.ts';
import { VERIFY_FAILURE_MAX_LINES } from '#system/gate/quality-gate-run/present-verify-failure.ts';
import type { Diagnostic } from '#system/gate/run/check-result.ts';
import {
  PACKAGE_BOUNDARY_MESSAGE,
  makeTempDirectory,
  packageBoundaryDiagnostics,
} from './quality-gate-follow-up-support.js';

function overridablePropsDiagnostic(path: string, line: number, column: number) {
  return {
    source: 'oxlint',
    ruleId: 'example-plugin/overridable-fixed-props',
    severity: 'error' as const,
    message: 'Fixed wrapper props must follow the forwarded prop spread.',
    location: { path, line, column },
  };
}

function unresolvedImportDiagnostic(path: string, target: string, line: number) {
  return {
    source: 'fallow',
    ruleId: 'unresolved-import',
    severity: 'error' as const,
    message: target,
    location: { path, line },
    groupHeader: `unresolved-import:${target}`,
  };
}

function lineCount(text: string | undefined): number {
  return text === undefined || text.length === 0 ? 0 : text.split('\n').length;
}

function expectWithinBudget(message: string | undefined): void {
  expect(lineCount(message)).toBeLessThanOrEqual(VERIFY_FAILURE_MAX_LINES);
}

function expectNoSpill(message: string | undefined, projectRoot: string): void {
  expectWithinBudget(message);
  expect(message).not.toContain(VERIFY_FAILURE_LOG_RELATIVE_PATH);
  expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(false);
}

async function followUpForDiagnostics(projectRoot: string, diagnostics: Diagnostic[]) {
  return await followUpForSettledResult({
    kind: 'ran',
    projectRoot,
    result: { exitCode: 1, diagnostics },
  });
}

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
    expectWithinBudget(message);
    expect(message).toContain(`other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`);
    const logged = await readTextFile(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH));
    expect(logged).toContain('error packages/package-boundaries:');
    expect(logged).toContain('warning packages/package-boundaries:');
    expect(message).toContain('error packages/other-rule:');
    expect(logged).toContain('verify: deferred: 16');
  });

  it('groups diagnostics with different messages by severity and rule', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-varied-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          overridablePropsDiagnostic('app/one.tsx', 10, 20),
          overridablePropsDiagnostic('app/two.tsx', 30, 40),
          overridablePropsDiagnostic('app/three.tsx', 50, 60),
        ],
      },
    });
    expectWithinBudget(message);
    expect(message).toContain('app/one.tsx:10:20');
    expect(message).toContain('app/two.tsx:30:40');
    expect(message).toContain('app/three.tsx:50:60');
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(false);
  });

  it('groups fallow unresolved-imports by missing target', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-unresolved-');
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: {
        exitCode: 1,
        diagnostics: [
          unresolvedImportDiagnostic('app/a.ts', './missing-lib', 4),
          unresolvedImportDiagnostic('app/b.ts', './missing-lib', 8),
          unresolvedImportDiagnostic('app/c.ts', './other-lib', 2),
        ],
      },
    });
    expectWithinBudget(message);
    expect(message).toContain('unresolved-import:./missing-lib');
    const logged = await readTextFile(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH));
    expect(logged).toContain('unresolved-import:./other-lib');
    expect(logged).toContain('app/c.ts:2');
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

  it('keeps grouped diagnostics compact within the line limit', async () => {
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
    const message = await followUpForDiagnostics(projectRoot, diagnostics);
    expectNoSpill(message, projectRoot);
  });

  it('stores all grouped diagnostics while limiting the grouped preview to five lines', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-grouped-large-');
    const diagnostics = Array.from({ length: 80 }, (_, index) => ({
      source: 'oxlint',
      ruleId: `packages/rule-${String(index)}`,
      severity: 'error' as const,
      message: `Finding number ${String(index)} with enough text to force spill across many distinct diagnostic blocks for the line budget.`,
      location: { path: `app/file-${String(index)}.ts`, line: 1, column: 1 },
    }));
    const message = await followUpForDiagnostics(projectRoot, diagnostics);
    const marker = `other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`;
    expect(message?.endsWith(marker)).toBe(true);
    expect(lineCount(message)).toBe(VERIFY_FAILURE_MAX_LINES);
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(true);
    const logged = await readTextFile(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH));
    expect(logged.length).toBeGreaterThan(0);
  });

  it('keeps five lines in-band without writing a log file', async () => {
    const projectRoot = await makeTempDirectory('aqg-follow-up-short-');
    const opaqueText = ['x', 'y', 'z', 'w'].join(String.fromCharCode(10));
    const message = await followUpForSettledResult({
      kind: 'ran',
      projectRoot,
      result: { exitCode: 1, diagnostics: [], opaqueText },
    });
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(lineCount(message)).toBe(VERIFY_FAILURE_MAX_LINES);
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
    const message = await followUpForDiagnostics(projectRoot, diagnostics);
    if (message === undefined) {
      throw new Error('expected follow-up message');
    }
    expect(message).toContain(`other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`);
    expect(lineCount(message)).toBeLessThanOrEqual(VERIFY_FAILURE_MAX_LINES);
    expect(message).not.toContain(projectRoot);
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(true);
  });
});
