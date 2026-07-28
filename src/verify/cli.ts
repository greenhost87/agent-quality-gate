import { createDefaultVerifyStepsResult } from './default-steps.js';
import { runVerify } from './run-verify.js';
import type { CliOptions, ParsedCliArgs, VerifyStepDebugInfo, VerifyTimings } from './types.js';

function helpText(): string {
  return ['Usage:', '  verify', '  verify --timings'].join('\n');
}

function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  let timings = false;
  for (const value of argv) {
    if (value === '--help' || value === '-h') {
      return { help: true, timings };
    }
    if (value === '--timings') {
      timings = true;
      continue;
    }
    return { help: false, timings, error: `verify: unknown option "${value}"` };
  }
  return { help: false, timings };
}

function printDebugInfo(stepDebugInfo: readonly VerifyStepDebugInfo[]): void {
  if (process.env.VERIFY_DEBUG !== '1' && process.env.VERIFY_DEBUG !== 'true') {
    return;
  }
  for (const info of stepDebugInfo) {
    process.stderr.write(
      `verify: debug step=${info.name} source=${info.source} config=${info.configPath ?? '<none>'}\n`
    );
  }
}

function printTimings(timings: VerifyTimings): void {
  for (const step of timings.steps) {
    process.stdout.write(`${step.name} take ${step.durationMs.toFixed(2)}ms\n`);
  }
  process.stdout.write(`Total ${timings.totalMs.toFixed(2)}ms\n`);
}

export async function runVerifyCli(options: CliOptions = {}): Promise<number> {
  const parsed = parseCliArgs(options.argv ?? process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }

  const plan = createDefaultVerifyStepsResult();
  printDebugInfo(plan.stepDebugInfo);
  const result = await runVerify(plan.steps, {
    collectTimings: parsed.timings,
    cwd: options.cwd,
  });
  if (result.code === 0) {
    process.stdout.write('verify: ok\n');
  }
  if (parsed.timings && result.timings) {
    printTimings(result.timings);
  }
  return result.code;
}
