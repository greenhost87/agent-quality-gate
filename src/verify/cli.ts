import { resolveVerifyPlan } from './config.js';
import { runVerify } from './run-verify.js';
import type { ResolvedVerifyPlan } from './types.js';

function helpText(): string {
  return [
    'Usage:',
    '  verify',
    '  verify --config <path>',
    '  verify --all-errors',
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
  error?: string;
} {
  let configPath: string | undefined;
  let allErrors = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? '';
    if (value === '--help' || value === '-h') {
      return { help: true, allErrors };
    }
    if (value === '--config' || value === '-c') {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('-')) {
        return { help: false, allErrors, error: `verify: missing value for "${value}"` };
      }
      configPath = nextValue;
      index += 1;
      continue;
    }
    if (value === '--all-errors') {
      allErrors = true;
      continue;
    }
    return { help: false, allErrors, error: `verify: unknown option "${value}"` };
  }
  return { configPath, help: false, allErrors };
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
  const result = await runVerify(plan.steps, { errorMode: parsed.allErrors ? 'all' : 'first' });
  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }
  if (result.stderr) {
    process.stderr.write(`${result.stderr}\n`);
  }
  return result.code;
}
