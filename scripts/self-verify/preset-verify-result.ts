import type { VerifyResult } from '../../gate/execute-verify/execute-verify.types.js';

export function appendVerifyStdout(stdoutParts: string[], stdout: string): void {
  if (stdout.length > 0) {
    stdoutParts.push(stdout);
  }
}

export function failedLocalPresetVerify(
  exitCode: number,
  stdoutParts: readonly string[],
  label: string,
  stderr: string,
): VerifyResult {
  return {
    exitCode,
    stdout: stdoutParts.join(''),
    stderr: `${label}${stderr}`,
  };
}

export function passedLocalPresetVerify(stdoutParts: readonly string[]): VerifyResult {
  return {
    exitCode: 0,
    stdout: stdoutParts.join(''),
    stderr: '',
  };
}

export function firstNonZeroResult(...results: readonly VerifyResult[]): VerifyResult | undefined {
  return results.find((result) => result.exitCode !== 0);
}

function aggregateFailedPresetStderr(
  failures: readonly {
    presetName: string;
    stderr: string;
  }[],
  failureLabel: (presetName: string) => string,
): string {
  const bodies = failures
    .map(({ presetName, stderr }) => `${failureLabel(presetName)}${stderr}`)
    .join('');
  if (failures.length === 1) {
    return bodies;
  }
  const names = failures.map(({ presetName }) => presetName).join(', ');
  return `verify: ${failures.length} local presets failed: ${names}\n${bodies}`;
}

export async function runLocalPresetSteps(
  presetNames: readonly string[],
  runStep: (presetName: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>,
  failureLabel: (presetName: string) => string,
): Promise<VerifyResult> {
  const settled = await Promise.all(
    presetNames.map(async (presetName) => ({
      presetName,
      result: await runStep(presetName),
    })),
  );
  settled.sort((left, right) => left.presetName.localeCompare(right.presetName));

  const stdoutParts: string[] = [];
  const failures: {
    presetName: string;
    exitCode: number;
    stderr: string;
  }[] = [];
  for (const { presetName, result } of settled) {
    appendVerifyStdout(stdoutParts, result.stdout);
    if (result.exitCode !== 0) {
      failures.push({
        presetName,
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    }
  }
  const [firstFailure] = failures;
  if (firstFailure !== undefined) {
    return {
      exitCode: firstFailure.exitCode,
      stdout: stdoutParts.join(''),
      stderr: aggregateFailedPresetStderr(failures, failureLabel),
    };
  }
  return passedLocalPresetVerify(stdoutParts);
}
