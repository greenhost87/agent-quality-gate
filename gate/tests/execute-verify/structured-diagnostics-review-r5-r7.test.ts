import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

import { mergeCheckResults, type Diagnostic } from '../../execute-verify/check-result.js';
import { runLintGroupChecks } from '../../execute-verify/run-lint-group-checks.js';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '../../quality-gate-run/present-diagnostics.js';
import {
  presentStructuredDiagnostics,
  VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS,
  VERIFY_FAILURE_LOG_RELATIVE_PATH,
} from '../../quality-gate-run/present-verify-failure.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('structured diagnostics review regressions R5-R7', () => {
  it('R5: opaque-only output respects diagnostic budget', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'aqg-opaque-budget-'));
    tempDirectories.push(projectRoot);
    const result = await presentStructuredDiagnostics(projectRoot, {
      diagnostics: [],
      opaqueText: 'x'.repeat(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS + 1),
    });
    expect(result.text.length).toBeLessThanOrEqual(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS);
    expect(result.text).toContain(VERIFY_FAILURE_LOG_RELATIVE_PATH);
    expect(result.spillPath).toBe(VERIFY_FAILURE_LOG_RELATIVE_PATH);
  });

  it('R5: exact budget boundary stays in-band without spill', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'aqg-opaque-exact-'));
    tempDirectories.push(projectRoot);
    const result = await presentStructuredDiagnostics(projectRoot, {
      diagnostics: [],
      opaqueText: 'z'.repeat(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS),
    });
    expect(result.text.length).toBe(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS);
    expect(result.spillPath).toBeUndefined();
  });

  it('R5: spill link counts toward the diagnostic budget', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'aqg-spill-link-budget-'));
    tempDirectories.push(projectRoot);
    const marker = `\nother errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`;
    const diagnostics: Diagnostic[] = Array.from({ length: 40 }, (_, index) => ({
      source: 'oxlint',
      ruleId: `rule-${String(index)}`,
      severity: 'error',
      message: `finding ${String(index)} ${'y'.repeat(80)}`,
      location: { path: `app/file-${String(index)}.ts`, line: 1, column: 1 },
    }));
    const result = await presentStructuredDiagnostics(projectRoot, { diagnostics });
    expect(result.text.length).toBeLessThanOrEqual(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS);
    if (result.spillPath !== undefined) {
      expect(result.text.endsWith(marker.trimStart()) || result.text.includes(marker.trim())).toBe(
        true,
      );
    }
  });

  it('R5: always returns a single oversized diagnostic block in-band', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'aqg-single-block-'));
    tempDirectories.push(projectRoot);
    const opaque = `OPAQUE_MARKER${'x'.repeat(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS - 20)}`;
    const result = await presentStructuredDiagnostics(projectRoot, {
      diagnostics: [
        {
          source: 'oxlint',
          ruleId: 'huge',
          severity: 'error',
          message: 'y'.repeat(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS + 50),
          location: { path: 'app/huge.ts', line: 1, column: 1 },
        },
      ],
      opaqueText: opaque,
    });
    expect(result.text.length).toBeGreaterThan(VERIFY_FAILURE_DIAGNOSTIC_HEAD_CHARS);
    expect(result.text).toContain('OPAQUE_MARKER');
    expect(result.text).toContain('error huge');
    expect(result.spillPath).toBeUndefined();
    expect(existsSync(join(projectRoot, VERIFY_FAILURE_LOG_RELATIVE_PATH))).toBe(false);
  });

  it('R6: merging a selected Oxlint group preserves deferred metadata', () => {
    const lint = { exitCode: 1, diagnostics: [] as Diagnostic[], deferredCount: 7 };
    const result = mergeCheckResults(lint, { exitCode: 1, diagnostics: [] });
    expect(result.deferredCount).toBe(7);
  });

  it('R6: orchestration merge of Oxlint UI with Fallow keeps deferredCount', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'aqg-merge-deferred-'));
    tempDirectories.push(projectRoot);
    const configPath = join(projectRoot, 'fallow.json');
    await writeFile(
      configPath,
      JSON.stringify({
        rules: {
          'thin-wrapper': 'error',
        },
      }),
    );
    const lintDeferred = 4;
    const result = await runLintGroupChecks(
      Promise.resolve({
        result: {
          exitCode: 1,
          diagnostics: [
            {
              source: 'oxlint',
              ruleId: 'sample-ui/render-only',
              severity: 'error',
              message: 'oxlint ui',
              location: { path: 'src/a.tsx', line: 1 },
            },
          ],
          deferredCount: lintDeferred,
        },
        selectedGroupId: 'ui',
        ms: 1,
      }),
      async () =>
        Promise.resolve({
          exitCode: 1,
          stdout: JSON.stringify({
            kind: 'dead-code',
            thin_wrappers: [
              { file: 'src/b.tsx', line: 1, component: 'Parent', child_component: 'Child' },
            ],
          }),
          stderr: '',
        }),
      projectRoot,
      configPath,
      ['ui', 'lint'],
      Promise.resolve({ result: [], ms: 0 }),
    );
    expect(result.selectedGroupId).toBe('ui');
    expect(result.result?.deferredCount).toBe(lintDeferred);
    expect(result.result?.diagnostics.length).toBeGreaterThan(1);
  });

  it('R7: shared location header shortens via pathFor and keeps related location', () => {
    const importer = 'app/components/features/fabrics/fabric-editor/fabric-editor.tsx';
    const diagnostic: Diagnostic = {
      source: 'sample',
      ruleId: 'sample/ownership',
      severity: 'error',
      message: 'review ownership',
      location: { path: 'app/components/features/fabrics/fabric-editor/attrs.tsx', line: 1 },
      related: [{ path: importer, role: 'importer' }],
      groupHeader: 'owner',
      groupLocation: { path: importer },
    };
    const text = renderDiagnosticBlocks(
      groupDiagnosticsForPresentation([diagnostic], (path) =>
        path.replace('app/components/features/fabrics/', '@p1/'),
      ),
    );
    expect(text).toContain('owner @p1/fabric-editor/fabric-editor.tsx');
    expect(text).not.toContain(`owner ${importer}`);
  });
});
