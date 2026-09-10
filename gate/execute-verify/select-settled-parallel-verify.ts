import { throwInternalVerifyFailure } from '../quality-gate-run/quality-gate-internal-error.js';
import { mergeCheckResults, type CheckResult } from './check-result.js';
import type { SettledStage } from './settle-stage.js';
import { rethrowSettledRejection } from './settle-stage.js';
import { withVerifyTiming } from './verify-timing.js';
import type { ExecuteVerifyOutcome, PhaseTimings, VerifyResult } from './execute-verify.js';

function oxlintFailurePrecedingFallow(
  result: VerifyResult | undefined,
  selectedGroupId: string | undefined,
  defaultPhase: string,
): VerifyResult | undefined {
  return selectedGroupId === defaultPhase || result?.exitCode === 0 ? undefined : result;
}

function timedCheckFailure(
  run: { result: CheckResult },
  timings: PhaseTimings,
  phasesStartedAt: number,
): ExecuteVerifyOutcome {
  return {
    result: withVerifyTiming(run.result, timings, phasesStartedAt),
    timings,
  };
}

type OxlintSettledValue = {
  result?: VerifyResult;
  selectedGroupId?: string;
  ms: number;
};

type SettledParallelVerifyInput = {
  oxlintSettled: SettledStage<OxlintSettledValue>;
  boundariesSettled: SettledStage<{ result: CheckResult; ms: number }>;
  presetsSettled: SettledStage<{ result: CheckResult; ms: number }>;
  hygieneSettled: SettledStage<{ result: CheckResult; ms: number }>;
  complexitySettled: SettledStage<{ result: CheckResult; ms: number }>;
  lintTimings: PhaseTimings;
  phasesStartedAt: number;
  defaultOxlintPhase: string;
};

/**
 * Select verify outcome after all parallel stages have settled (R2–R4).
 */
export function selectSettledParallelVerifyOutcome(
  input: SettledParallelVerifyInput,
): ExecuteVerifyOutcome {
  const {
    oxlintSettled,
    boundariesSettled,
    presetsSettled,
    hygieneSettled,
    complexitySettled,
    lintTimings,
    phasesStartedAt,
    defaultOxlintPhase,
  } = input;

  if (oxlintSettled.status === 'rejected') {
    rethrowSettledRejection(oxlintSettled.reason);
  }
  if (presetsSettled.status === 'rejected') {
    rethrowSettledRejection(presetsSettled.reason);
  }
  if (boundariesSettled.status === 'rejected') {
    rethrowSettledRejection(boundariesSettled.reason);
  }

  const oxlintRun = oxlintSettled.value;
  const boundariesRun = boundariesSettled.value;
  const presetBoundariesTimed = presetsSettled.value;

  const immediateOxlintFailure = oxlintFailurePrecedingFallow(
    oxlintRun.result,
    oxlintRun.selectedGroupId,
    defaultOxlintPhase,
  );
  if (immediateOxlintFailure !== undefined) {
    return {
      result: withVerifyTiming(immediateOxlintFailure, lintTimings, phasesStartedAt),
      timings: lintTimings,
    };
  }
  if (presetBoundariesTimed.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(presetBoundariesTimed.result, lintTimings, phasesStartedAt),
      timings: lintTimings,
    };
  }
  if (boundariesRun.result.exitCode !== 0) {
    return timedCheckFailure(boundariesRun, lintTimings, phasesStartedAt);
  }
  if (oxlintRun.result !== undefined && oxlintRun.result.exitCode !== 0) {
    return {
      result: withVerifyTiming(oxlintRun.result, lintTimings, phasesStartedAt),
      timings: lintTimings,
    };
  }

  if (hygieneSettled.status === 'rejected') {
    throwInternalVerifyFailure(hygieneSettled.reason);
  }
  if (complexitySettled.status === 'rejected') {
    throwInternalVerifyFailure(complexitySettled.reason);
  }
  const hygieneRun = hygieneSettled.value;
  const complexityRun = complexitySettled.value;
  if (hygieneRun.result.exitCode !== 0) {
    return timedCheckFailure(hygieneRun, lintTimings, phasesStartedAt);
  }
  if (complexityRun.result.exitCode !== 0) {
    return timedCheckFailure(complexityRun, lintTimings, phasesStartedAt);
  }

  return {
    result: withVerifyTiming(
      mergeCheckResults(
        ...(oxlintRun.result === undefined ? [] : [oxlintRun.result]),
        presetBoundariesTimed.result,
        boundariesRun.result,
        hygieneRun.result,
        complexityRun.result,
      ),
      lintTimings,
      phasesStartedAt,
    ),
    timings: lintTimings,
  };
}
