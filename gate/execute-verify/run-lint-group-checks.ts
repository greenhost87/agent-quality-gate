import { checkHasFindings, mergeCheckResults, type CheckResult } from './check-result.js';
import { checkFallowStructuralFindings } from './fallow-structural-findings.js';
import { settleStage, rethrowSettledRejection } from './settle-stage.js';
import { timedCheck } from './verify-timing.js';
import type { ToolRunner, VerifyResult } from './execute-verify.js';

export type LintGroupRun = { result?: VerifyResult; selectedGroupId?: string; ms: number };

type GroupCheck = { group: string; result: CheckResult };

function phaseOf(group: string): string {
  return group.split(':')[0] ?? group;
}

function selectLintGroup(
  lint: LintGroupRun,
  checks: readonly CheckResult[],
  phaseOrder: readonly string[],
  ms: number,
): LintGroupRun {
  if (lint.result !== undefined && lint.selectedGroupId === undefined) return { ...lint, ms };
  const candidates: GroupCheck[] = checks.flatMap((result) =>
    result.lintGroup === undefined ? [] : [{ group: result.lintGroup, result }],
  );
  if (lint.result !== undefined && lint.selectedGroupId !== undefined) {
    candidates.unshift({ group: lint.selectedGroupId, result: lint.result });
  }
  const failing = candidates.filter((check) => check.result.exitCode !== 0);
  const active = failing.length > 0 ? failing : candidates;
  const selected = phaseOrder.find((phase) =>
    active.some(
      (check) =>
        phaseOf(check.group) === phase &&
        (check.result.exitCode !== 0 || checkHasFindings(check.result)),
    ),
  );
  const omitted = active.find(
    (check) =>
      !phaseOrder.includes(phaseOf(check.group)) &&
      (check.result.exitCode !== 0 || checkHasFindings(check.result)),
  );
  if (omitted !== undefined && (selected === undefined || failing.length === 0)) {
    throw new Error(
      `verify.lintGroups must include ${phaseOf(omitted.group)} to report check findings`,
    );
  }
  if (selected === undefined) return { ms };
  const due = active.filter((check) => phaseOf(check.group) === selected);
  const hidden = candidates.filter((check) => !due.includes(check));
  const result = mergeCheckResults(...due.map((check) => check.result));
  const deferredCount =
    (result.deferredCount ?? 0) +
    hidden.reduce((sum, check) => sum + (check.result.deferredCount ?? 0), 0);
  // Successful checks keep every warning; later pipeline failures still take precedence.
  const visible =
    failing.length === 0 ? mergeCheckResults(...candidates.map((check) => check.result)) : result;
  return {
    result: {
      ...visible,
      ...(failing.length > 0 && deferredCount > 0 ? { deferredCount } : {}),
    },
    selectedGroupId: due.find((check) => check.group.includes(':'))?.group ?? selected,
    ms,
  };
}

/** Settle every launched check before selection or config cleanup. */
export async function runLintGroupChecks(
  oxlint: Promise<LintGroupRun>,
  run: ToolRunner,
  projectRoot: string,
  configPath: string,
  phaseOrder: readonly string[],
  presetChecks: Promise<{ result: CheckResult[]; ms: number }>,
): Promise<LintGroupRun> {
  const startedAt = performance.now();
  const [lintSettled, structuralSettled, presetsSettled] = await Promise.all([
    settleStage(oxlint),
    settleStage(
      timedCheck(async () => checkFallowStructuralFindings(run, projectRoot, configPath)),
    ),
    settleStage(presetChecks),
  ]);
  if (lintSettled.status === 'rejected') rethrowSettledRejection(lintSettled.reason);
  if (presetsSettled.status === 'rejected') rethrowSettledRejection(presetsSettled.reason);
  const lint = lintSettled.value;
  if (structuralSettled.status === 'rejected') {
    const earlier = selectLintGroup(
      lint,
      presetsSettled.value.result,
      phaseOrder,
      performance.now() - startedAt,
    );
    const phase =
      earlier.selectedGroupId === undefined ? undefined : phaseOf(earlier.selectedGroupId);
    if (
      earlier.result !== undefined &&
      earlier.result.exitCode !== 0 &&
      (phase === undefined || phaseOrder.indexOf(phase) < phaseOrder.indexOf('ui'))
    )
      return earlier;
    rethrowSettledRejection(structuralSettled.reason);
  }
  return selectLintGroup(
    lint,
    [{ ...structuralSettled.value.result, lintGroup: 'ui' }, ...presetsSettled.value.result],
    phaseOrder,
    performance.now() - startedAt,
  );
}
