import { expect, test } from 'bun:test';
import { runLintGroupChecks, type LintGroupRun } from '#system/gate/run/run-lint-group-checks.ts';
import { selectSettledParallelVerifyOutcome } from '#system/gate/run/select-settled-parallel-verify.ts';
import { emptyCheckResult, type CheckResult } from '#system/gate/run/check-result.ts';

function finding(
  message: string,
  lintGroup: 'boundaries' | 'contracts' | 'lint' | 'ui' | 'e2e' | undefined,
  warning = false,
): CheckResult {
  return {
    lintGroup,
    exitCode: warning ? 0 : 1,
    diagnostics: [
      {
        source: 'sample',
        ruleId: `sample/${message}`,
        severity: warning ? 'warning' : 'error',
        message,
      },
    ],
    hints: [{ kind: 'builtin', id: 'avoid-micro-splits' }],
  };
}

async function select(
  checks: CheckResult[],
  lint?: LintGroupRun,
  order = ['boundaries', 'contracts', 'lint', 'ui', 'e2e'],
  structural: CheckResult = emptyCheckResult(),
) {
  return runLintGroupChecks(
    Promise.resolve(lint ?? { ms: 0 }),
    async () => {
      await Promise.resolve();
      return structural;
    },
    order,
    Promise.resolve({ result: checks, ms: 0 }),
  );
}

test('preset UI findings wait behind lint by default and respect UI-first order', async () => {
  const lint = {
    result: { ...finding('lint', undefined), deferredCount: 1 },
    selectedGroupId: 'lint',
    ms: 0,
  };
  const checks = [finding('ui', 'ui')];
  const normal = await select(checks, lint);
  expect(normal.result?.diagnostics.map((item) => item.message)).toEqual(['lint']);
  expect(normal.result?.deferredCount).toBe(1);
  const reversed = await select(checks, lint, ['ui', 'lint']);
  expect(reversed.result?.diagnostics.map((item) => item.message)).toEqual(['ui']);
  expect(reversed.result?.deferredCount).toBe(1);
});

test('e2e findings wait until UI checks pass', async () => {
  const selected = await select([finding('ui', 'ui'), finding('e2e', 'e2e')]);
  expect(selected.selectedGroupId).toBe('ui');
  expect(selected.result?.diagnostics.map((item) => item.message)).toEqual(['ui']);

  const e2e = await select([finding('e2e', 'e2e')]);
  expect(e2e.selectedGroupId).toBe('e2e');
  expect(e2e.result?.diagnostics.map((item) => item.message)).toEqual(['e2e']);
});

test('preset boundaries join the selected boundary plugin and keep deferred counts', async () => {
  const lint = {
    result: { ...finding('plugin', undefined), deferredCount: 3 },
    selectedGroupId: 'boundaries:database',
    ms: 0,
  };
  const selected = await select(
    [finding('boundary', 'boundaries'), { ...finding('ui', 'ui'), deferredCount: 1 }],
    lint,
  );
  expect(selected.selectedGroupId).toBe('boundaries:database');
  expect(selected.result?.diagnostics.map((item) => item.message)).toEqual(['plugin', 'boundary']);
  expect(selected.result?.deferredCount).toBe(4);
});

test('preset warnings do not gate failures and retain hints after success', async () => {
  const warning = finding('ownership', 'boundaries', true);
  const failed = await select([warning, finding('ui', 'ui')]);
  expect(failed.result?.diagnostics.map((item) => item.message)).toEqual(['ui']);
  expect(failed.result?.deferredCount ?? 0).toBe(0);
  const passed = await select([warning]);
  expect(passed.result?.exitCode).toBe(0);
  expect(passed.result?.diagnostics).toEqual(warning.diagnostics);
  expect(passed.result?.hints).toEqual(warning.hints);
});

test('UI contributions merge with stock/Oxlint results without losing hints', async () => {
  const selected = await select([finding('preset', 'ui')], {
    result: { ...finding('oxlint', undefined), deferredCount: 2 },
    selectedGroupId: 'ui',
    ms: 0,
  });
  expect(selected.result?.diagnostics).toHaveLength(2);
  expect(selected.result?.hints).toEqual([
    { kind: 'builtin', id: 'avoid-micro-splits' },
    { kind: 'builtin', id: 'avoid-micro-splits' },
  ]);
  expect(selected.result?.deferredCount).toBe(2);
});

async function expectMissingGroupFailure(checks: CheckResult[], order: string[]): Promise<void> {
  let failure: Error | undefined;
  try {
    await select(checks, undefined, order);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }
  expect(failure?.message).toContain('must include ui');
}

test('findings in an omitted group fail closed', async () => {
  await expectMissingGroupFailure([finding('ui', 'ui')], ['lint']);
});

test('grouped crashes cannot become a clean result', async () => {
  const failure: CheckResult = {
    lintGroup: 'ui',
    exitCode: 2,
    diagnostics: [],
    failures: [{ exitCode: 2, message: 'crash' }],
  };
  const result = await select([failure]);
  expect(result.result?.exitCode).toBe(2);
  expect(result.result?.failures?.[0]?.message).toBe('crash');
});

test('a failed stock UI check does not hide earlier preset boundary findings', async () => {
  const selected = await runLintGroupChecks(
    Promise.resolve({
      result: finding('plugin', undefined),
      selectedGroupId: 'boundaries:database',
      ms: 0,
    }),
    async () => {
      await Promise.resolve();
      return {
        exitCode: 2,
        diagnostics: [],
        failures: [{ exitCode: 2, message: 'structural spawn failed' }],
      };
    },
    ['boundaries', 'lint', 'ui'],
    Promise.resolve({ result: [finding('boundary', 'boundaries')], ms: 0 }),
  );
  expect(selected.result?.diagnostics.map((item) => item.message)).toEqual(['plugin', 'boundary']);
});

test('warnings in an omitted group cannot leak through another successful group', async () => {
  await expectMissingGroupFailure(
    [finding('boundary', 'boundaries', true), finding('ui', 'ui', true)],
    ['boundaries', 'lint'],
  );
});

function settled(result: CheckResult) {
  return { status: 'fulfilled' as const, value: { result, ms: 0 }, ms: 0 };
}

test('ungrouped preset warnings survive success but wait behind hygiene failures', () => {
  const warning = finding('preset', undefined, true);
  const input = {
    oxlintSettled: { status: 'fulfilled' as const, value: { ms: 0 }, ms: 0 },
    boundariesSettled: settled(emptyCheckResult()),
    presetsSettled: settled(warning),
    hygieneSettled: settled(emptyCheckResult()),
    complexitySettled: settled(emptyCheckResult()),
    lintTimings: { cyclesMs: 0 },
    phasesStartedAt: performance.now(),
    defaultOxlintPhase: 'lint',
  };
  expect(selectSettledParallelVerifyOutcome(input).result.diagnostics).toEqual(warning.diagnostics);
  expect(
    selectSettledParallelVerifyOutcome({
      ...input,
      hygieneSettled: settled(finding('hygiene', undefined)),
    }).result.diagnostics[0]?.message,
  ).toBe('hygiene');
});
