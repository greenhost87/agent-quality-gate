import { execa } from 'execa';

import { extractFirstDiagnostic, mergeOutput } from './diagnostics.js';
import { VERIFY_STEPS } from './default-steps.js';
import type { RunVerifyOptions, VerifyErrorMode, VerifyResult, VerifyStep, VerifyStepFailure } from './types.js';

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

async function runStep(step: VerifyStep, errorMode: VerifyErrorMode): Promise<VerifyStepFailure | null> {
  try {
    const result = await execa(step.command, step.args, {
      reject: false,
      all: true,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    if (result.exitCode === 0) {
      return null;
    }

    const output = mergeOutput(result.stdout, result.stderr, result.all || undefined);
    return renderStepFailure(step, output, result.exitCode || 1, errorMode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      code: 1,
      stderr: `verify: failed to start step "${step.name}": ${message}`,
    };
  }
}

export async function runVerify(
  steps: readonly VerifyStep[] = VERIFY_STEPS,
  options: RunVerifyOptions = {}
): Promise<VerifyResult> {
  const errorMode = resolveErrorMode(options);
  const failures: VerifyStepFailure[] = [];

  for (const step of steps) {
    const failure = await runStep(step, errorMode);
    if (failure) {
      failures.push(failure);
      if (errorMode === 'first') {
        return failure;
      }
    }
  }

  if (failures.length > 0) {
    return {
      code: failures[0]?.code ?? 1,
      stderr: failures.map((failure) => failure.stderr).join('\n\n'),
    };
  }

  return { code: 0, stdout: 'verify: ok' };
}
