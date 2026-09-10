import { describe, expect, it } from 'bun:test';

import { failedCheckResult, mergeCheckResults } from '../../execute-verify/check-result.js';
import {
  checkResultFromFallowBoundariesToolRun,
  checkResultFromFallowCyclesToolRun,
  checkResultFromFallowComplexityToolRun,
  checkResultFromFallowHygieneToolRun,
} from '../../execute-verify/fallow-json-diagnostics.js';
import { checkResultFromOxlintToolRun } from '../../execute-verify/verify-tool-run.js';
import { formatVerifyResultDiagnostics } from '../../quality-gate-run/format-diagnostics.js';

describe('structured diagnostics preservation', () => {
  it('R8: exit one without Oxlint findings is not a successful lint run', () => {
    const result = checkResultFromOxlintToolRun(
      { exitCode: 1, stdout: '{"diagnostics":[]}', stderr: '' },
      new Set(),
    );
    expect(result.exitCode).toBe(1);
    expect(result.failures).toHaveLength(1);
  });

  it.each([0, 1])('R8: ignore cannot discard unexpected Oxlint stderr at exit %i', (exitCode) => {
    const result = checkResultFromOxlintToolRun(
      {
        exitCode,
        stdout: JSON.stringify({
          diagnostics: [{ message: 'ignored', code: 'eslint(no-debugger)', severity: 'warning' }],
        }),
        stderr: 'plugin worker failed',
      },
      new Set(['no-debugger']),
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.failures?.[0]?.stderr).toBe('plugin worker failed');
  });

  it('R8: kind alone is not a complete Fallow report even at exit zero', () => {
    for (const result of [
      checkResultFromFallowCyclesToolRun({
        exitCode: 0,
        stdout: '{"kind":"dead-code"}',
        stderr: '',
      }),
      checkResultFromFallowHygieneToolRun({
        exitCode: 0,
        stdout: '{"kind":"combined","check":{}}',
        stderr: '',
      }),
      checkResultFromFallowHygieneToolRun({
        exitCode: 0,
        stdout: '{"kind":"combined","dupes":{}}',
        stderr: '',
      }),
    ]) {
      expect(result.exitCode).not.toBe(0);
      expect(result.failures).toHaveLength(1);
    }
  });

  it('R8: incomplete health JSON and unexplained health failure cannot pass', () => {
    for (const raw of [
      { exitCode: 0, stdout: '{"kind":"health"}', stderr: '' },
      { exitCode: 1, stdout: '{"kind":"health","findings":[]}', stderr: '' },
    ]) {
      const result = checkResultFromFallowComplexityToolRun(raw);
      expect(result.exitCode).not.toBe(0);
      expect(result.failures).toHaveLength(1);
    }
  });

  it.each(['', 'fatal protocol failure'])(
    'F1: empty JSON output fails even with exit zero (stderr=%s)',
    (stderr) => {
      const raw = { exitCode: 0, stdout: ' \n', stderr };
      for (const result of [
        checkResultFromOxlintToolRun(raw, new Set()),
        checkResultFromFallowCyclesToolRun(raw),
      ]) {
        expect(result.exitCode).not.toBe(0);
        expect(result.diagnostics).toEqual([]);
        expect(result.failures).toHaveLength(1);
        expect(result.failures?.[0]?.stdout).toBe(raw.stdout);
        expect(result.failures?.[0]?.stderr).toBe(stderr);
        expect(result.failures?.[0]?.message.length).toBeGreaterThan(0);
      }
    },
  );

  it('R9: separate clone groups retain their participants and line ranges', () => {
    const result = checkResultFromFallowHygieneToolRun({
      exitCode: 1,
      stderr: '',
      stdout: JSON.stringify({
        kind: 'combined',
        check: { total_issues: 0 },
        dupes: {
          clone_groups: [
            ['a', 'b'],
            ['c', 'd'],
          ].map((names) => ({
            instances: names.map((name) => ({
              file: `src/${name}.ts`,
              start_line: 10,
              end_line: 20,
            })),
          })),
        },
      }),
    });
    expect(result.diagnostics).toHaveLength(2);
    expect(
      result.diagnostics.map((entry) => [
        entry.location?.path,
        ...(entry.related?.map((site) => site.path) ?? []),
      ]),
    ).toEqual([
      ['src/a.ts', 'src/b.ts'],
      ['src/c.ts', 'src/d.ts'],
    ]);
    expect(result.diagnostics[0]?.related?.[0]?.endLine).toBe(20);
    const text = formatVerifyResultDiagnostics(result);
    expect(text).toContain('src/a.ts:10-20');
    expect(text).toContain('src/b.ts:10-20');
  });

  it('F3: nested merges preserve every execution failure and its streams', () => {
    const first = failedCheckResult(2, 'first failure', { stdout: 'first raw output' });
    const second = failedCheckResult(3, 'second failure', { stderr: 'second raw error' });
    const third = failedCheckResult(4, 'third failure');
    const finding = {
      exitCode: 1,
      diagnostics: [{ source: 'test', severity: 'error' as const, message: 'lint finding' }],
      deferredCount: 5,
    };
    const result = mergeCheckResults(mergeCheckResults(first, finding, second), third);
    expect(result.exitCode).toBe(4);
    expect(result.failures).toEqual([
      ...(first.failures ?? []),
      ...(second.failures ?? []),
      ...(third.failures ?? []),
    ]);
    expect(result.deferredCount).toBe(5);
    const text = formatVerifyResultDiagnostics(result);
    for (const message of ['first failure', 'second failure', 'third failure', 'lint finding']) {
      expect(text).toContain(message);
    }
  });

  it('F4: cycle members keep their order without embedding paths in messages', () => {
    const files = ['src/z.ts', 'src/a.ts', 'src/m.ts'];
    const result = checkResultFromFallowCyclesToolRun({
      exitCode: 1,
      stdout: JSON.stringify({
        kind: 'dead-code',
        re_export_cycles: [{ files }],
        circular_dependencies: [{ files }],
      }),
      stderr: '',
    });
    expect(result.failures).toBeUndefined();
    expect(result.diagnostics).toHaveLength(2);
    for (const diagnostic of result.diagnostics) {
      expect([
        diagnostic.location?.path,
        ...(diagnostic.related?.map((entry) => entry.path) ?? []),
      ]).toEqual(files);
      for (const path of files) expect(diagnostic.message).not.toContain(path);
    }
  });

  it('F4: boundary endpoints are locations, while zone details remain in the message', () => {
    const result = checkResultFromFallowBoundariesToolRun({
      exitCode: 1,
      stdout: JSON.stringify({
        kind: 'dead-code',
        boundary_violations: [
          {
            from_path: 'src/a.ts',
            to_path: 'src/b.ts',
            from_zone: 'ui',
            to_zone: 'database',
            line: 7,
            col: 2,
          },
        ],
      }),
      stderr: '',
    });
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.location).toEqual({ path: 'src/a.ts', line: 7, column: 2 });
    expect(diagnostic?.related).toEqual([{ path: 'src/b.ts', role: 'import-target' }]);
    expect(diagnostic?.message).toContain('ui -> database');
    expect(diagnostic?.message).not.toContain('src/');
  });
});
