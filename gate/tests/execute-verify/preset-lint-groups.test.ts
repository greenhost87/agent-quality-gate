import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import {
  runLintGroupChecks,
  type LintGroupRun,
} from '../../execute-verify/run-lint-group-checks.js';
import { selectSettledParallelVerifyOutcome } from '../../execute-verify/select-settled-parallel-verify.js';
import { emptyCheckResult, type CheckResult } from '../../execute-verify/check-result.js';
import type { OxlintRulePhase } from '../../../preset-catalog/oxlint-config/oxlint-rule-setting.js';
import { useExecuteVerifyProjects } from '../../../tests/support/execute-verify-fixture.js';

const { makeTempDirectory } = useExecuteVerifyProjects();

function finding(
  message: string,
  lintGroup: OxlintRulePhase | undefined,
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
  order = ['boundaries', 'contracts', 'lint', 'ui'],
) {
  const root = await makeTempDirectory('preset-group-');
  const config = join(root, 'fallow.json');
  await writeFile(config, '{"rules":{}}');
  return runLintGroupChecks(
    Promise.resolve(lint ?? { ms: 0 }),
    async () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
    root,
    config,
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

test('findings in an omitted group fail closed', async () => {
  let failure: Error | undefined;
  try {
    await select([finding('ui', 'ui')], undefined, ['lint']);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }
  expect(failure?.message).toContain('must include ui');
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

test('an invalid stock UI report does not hide earlier preset boundary findings', async () => {
  const root = await makeTempDirectory('preset-crash-order-');
  const config = join(root, 'fallow.json');
  await writeFile(config, '{"rules":{"thin-wrapper":"error"}}');
  const selected = await runLintGroupChecks(
    Promise.resolve({
      result: finding('plugin', undefined),
      selectedGroupId: 'boundaries:database',
      ms: 0,
    }),
    async () => Promise.resolve({ exitCode: 1, stdout: '{}', stderr: '' }),
    root,
    config,
    ['boundaries', 'lint', 'ui'],
    Promise.resolve({ result: [finding('boundary', 'boundaries')], ms: 0 }),
  );
  expect(selected.result?.diagnostics.map((item) => item.message)).toEqual(['plugin', 'boundary']);
});

test('warnings in an omitted group cannot leak through another successful group', async () => {
  let failure: Error | undefined;
  try {
    await select([finding('boundary', 'boundaries', true), finding('ui', 'ui', true)], undefined, [
      'boundaries',
      'lint',
    ]);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }
  expect(failure?.message).toContain('must include ui');
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
