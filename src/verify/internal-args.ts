import type { ParsedConfigArgs } from './internal-tools.types.js';

export function readRequiredNextArg(args: readonly string[], index: number): string {
  const arg = args[index] ?? '';
  const nextArg = args[index + 1];
  if (!nextArg) {
    throw new Error(`verify: missing value for "${arg}"`);
  }
  return nextArg;
}

export function parseRequiredConfigArgs(args: readonly string[], toolName: string): ParsedConfigArgs {
  let configPath = '';
  const rest: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '--config' || arg === '-c') {
      configPath = readRequiredNextArg(args, index);
      index += 1;
      continue;
    }
    rest.push(arg);
  }
  if (!configPath) {
    throw new Error(`verify: internal ${toolName} args are missing --config value`);
  }
  return { configPath, rest };
}
