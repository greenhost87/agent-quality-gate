import { performance } from 'node:perf_hooks';

import { execa } from 'execa';

import { extractFirstDiagnostic, mergeOutput } from './diagnostics.js';
import { createDefaultVerifySteps } from './default-steps.js';
import type {
  RunVerifyOptions,
  VerifyErrorMode,
  VerifyResult,
  VerifyStep,
  VerifyStepFailure,
  VerifyStepRunResult,
  VerifyStepTiming,
} from './types.js';

function resolveErrorMode(options: RunVerifyOptions): VerifyErrorMode {
  const { errorMode = 'first' } = options;
  if (errorMode === 'first' || errorMode === 'all') {
    return errorMode;
  }
  throw new Error(`verify: unknown error mode "${String(errorMode)}"`);
}

function renderStepFailure(
  step: VerifyStep,
  output: string,
  code: number,
  errorMode: VerifyErrorMode
): VerifyStepFailure {
  const errorLines = [`verify: failed at step "${step.name}"`];
  if (output) {
    const renderedOutput = errorMode === 'all' ? output : extractFirstDiagnostic(output);
    if (renderedOutput) {
      errorLines.push(renderedOutput);
    }
  }
  return {
    code,
    stderr: errorLines.join('\n'),
  };
}

async function runStep(step: VerifyStep, errorMode: VerifyErrorMode): Promise<VerifyStepRunResult> {
  const startedAt = performance.now();
  try {
    const result = await execa(step.command, step.args, {
      reject: false,
      all: true,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    const code = result.exitCode || 0;
    const timing: VerifyStepTiming = {
      name: step.name,
      code,
      durationMs: performance.now() - startedAt,
    };
    if (code === 0) {
      return {
        failure: null,
        timing,
      };
    }

    const output = mergeOutput(result.stdout, result.stderr, result.all || undefined);
    return {
      failure: renderStepFailure(step, output, code, errorMode),
      timing,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      failure: {
        code: 1,
        stderr: `verify: failed to start step "${step.name}": ${message}`,
      },
      timing: {
        name: step.name,
        code: 1,
        durationMs: performance.now() - startedAt,
      },
    };
  }
}

export async function runVerify(
  steps: readonly VerifyStep[] = createDefaultVerifySteps(),
  options: RunVerifyOptions = {}
): Promise<VerifyResult> {
  const errorMode = resolveErrorMode(options);
  const collectTimings = options.collectTimings === true;
  const failures: VerifyStepFailure[] = [];
  const stepTimings: VerifyStepTiming[] = [];
  const startedAt = performance.now();

  function withOptionalTimings(result: VerifyResult): VerifyResult {
    if (!collectTimings) {
      return result;
    }
    return {
      ...result,
      timings: {
        totalMs: performance.now() - startedAt,
        steps: stepTimings,
      },
    };
  }

  for (const step of steps) {
    const { failure, timing } = await runStep(step, errorMode);
    if (collectTimings) {
      stepTimings.push(timing);
    }
    if (failure) {
      failures.push(failure);
      if (errorMode === 'first') {
        return withOptionalTimings(failure);
      }
    }
  }

  if (failures.length > 0) {
    return withOptionalTimings({
      code: failures[0]?.code ?? 1,
      stderr: failures.map((failure) => failure.stderr).join('\n\n'),
    });
  }

  return withOptionalTimings({ code: 0, stdout: 'verify: ok' });
}
