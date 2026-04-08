import { resolveVerifyPlan } from './config.js';
import { runVerify } from './run-verify.js';
import type { ResolvedVerifyPlan, VerifyTimings } from './types.js';

function helpText(): string {
  return [
    'Usage:',
    '  verify',
    '  verify --config <path>',
    '  verify --all-errors',
    '  verify --timings',
    '  verify --all-errors --timings',
    '',
    'Config module format:',
    '  export default [{ name, command, args }]',
    '  // or',
    '  export default { steps: [{ name, command, args }] }',
  ].join('\n');
}

function parseCliArgs(argv: readonly string[]): {
  configPath?: string;
  help: boolean;
  allErrors: boolean;
  timings: boolean;
  error?: string;
} {
  let configPath: string | undefined;
  let allErrors = false;
  let timings = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? '';
    if (value === '--help' || value === '-h') {
      return { help: true, allErrors, timings };
    }
    if (value === '--config' || value === '-c') {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('-')) {
        return { help: false, allErrors, timings, error: `verify: missing value for "${value}"` };
      }
      configPath = nextValue;
      index += 1;
      continue;
    }
    if (value === '--all-errors') {
      allErrors = true;
      continue;
    }
    if (value === '--timings') {
      timings = true;
      continue;
    }
    return { help: false, allErrors, timings, error: `verify: unknown option "${value}"` };
  }
  return { configPath, help: false, allErrors, timings };
}

function isDebugEnabled(): boolean {
  const value = process.env.VERIFY_DEBUG;
  return value === '1' || value === 'true';
}

function printDebugInfo(plan: ResolvedVerifyPlan): void {
  if (!isDebugEnabled()) {
    return;
  }

  const configPathLabel = plan.configFilePath ?? '<none>';
  process.stderr.write(`verify: debug config-file=${configPathLabel}\n`);
  for (const info of plan.stepDebugInfo) {
    const configLabel = info.configPath ?? '<none>';
    process.stderr.write(`verify: debug step=${info.name} source=${info.source} config=${configLabel}\n`);
  }
}

function formatDuration(durationMs: number): string {
  return `${durationMs.toFixed(2)}ms`;
}

function printTimings(timings: VerifyTimings): void {
  for (const step of timings.steps) {
    process.stdout.write(`${step.name} take ${formatDuration(step.durationMs)}\n`);
  }
  process.stdout.write(`Total ${formatDuration(timings.totalMs)}\n`);
}

export async function runVerifyCli(options: { argv?: readonly string[]; cwd?: string } = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const parsed = parseCliArgs(argv);
  if (parsed.help) {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }

  let plan: ResolvedVerifyPlan;
  try {
    plan = await resolveVerifyPlan({
      cwd: options.cwd,
      configPath: parsed.configPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
  printDebugInfo(plan);
  const result = await runVerify(plan.steps, {
    errorMode: parsed.allErrors ? 'all' : 'first',
    collectTimings: parsed.timings,
  });
  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }
  if (result.stderr) {
    process.stderr.write(`${result.stderr}\n`);
  }
  if (parsed.timings && result.timings) {
    printTimings(result.timings);
  }
  return result.code;
}
