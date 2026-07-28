import { performance } from 'node:perf_hooks';

import { createDefaultVerifySteps } from './default-steps.js';
import { spawnCommand } from './spawn.js';
import type { RunVerifyOptions, VerifyResult, VerifyStep, VerifyStepTiming } from './types.js';

async function runStep(step: VerifyStep, cwd: string): Promise<VerifyStepTiming> {
  const startedAt = performance.now();
  try {
    const result = await spawnCommand(step.command, step.args, cwd, true, step.environment);
    return {
      name: step.name,
      code: result.exitCode,
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`verify: failed to start step "${step.name}": ${message}\n`);
    return {
      name: step.name,
      code: 1,
      durationMs: performance.now() - startedAt,
    };
  }
}

export async function runVerify(
  steps: readonly VerifyStep[] = createDefaultVerifySteps(),
  options: RunVerifyOptions = {}
): Promise<VerifyResult> {
  const cwd = options.cwd ?? process.cwd();
  const collectTimings = options.collectTimings === true;
  const stepTimings: VerifyStepTiming[] = [];
  const startedAt = performance.now();
  let firstFailureCode = 0;

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
    const timing = await runStep(step, cwd);
    if (collectTimings) {
      stepTimings.push(timing);
    }
    if (firstFailureCode === 0 && timing.code !== 0) {
      firstFailureCode = timing.code;
    }
  }

  return withOptionalTimings({ code: firstFailureCode });
}
