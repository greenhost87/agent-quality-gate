import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import bundledEslintConfig from '../../eslint.config.mjs';
import bundledEslintLengthConfig from '../../eslint-length.config.mjs';
import { ESLint } from 'eslint';
import { execa } from 'execa';
import { main as runKnipMain } from '../../node_modules/knip/dist/index.js';
import { createOptions as createKnipOptions } from '../../node_modules/knip/dist/util/create-options.js';
import type { Linter } from 'eslint';
import ts from 'typescript';

import { runDuplicateShapesStep } from './duplicate-shapes.js';
import { runDepcruise } from './internal-depcruise.js';
import { parseRequiredConfigArgs, readRequiredNextArg } from './internal-args.js';
import { runJscpd } from './internal-jscpd.js';
import { runMarkdownHeadingsStep } from './internal-steps.js';
import type { EslintConfigModule } from './internal-steps.types.js';
import type { ParsedKnipArgs, ParsedTscArgs } from './internal-tools.types.js';
import type { InternalVerifyToolOptions } from './types.js';

function isEslintConfigModule(value: unknown): value is EslintConfigModule<Linter.Config> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'default' in value &&
    Array.isArray((value as { default?: unknown }).default)
  );
}

async function loadBundledEslintConfig(configPath: string): Promise<Linter.Config[]> {
  const configModule: unknown = await import(pathToFileURL(configPath).href);
  if (!isEslintConfigModule(configModule)) {
    throw new Error(`verify: bundled eslint config "${configPath}" did not export a config array`);
  }
  return configModule.default;
}

async function runEslint(configPath: string, args: readonly string[]): Promise<number> {
  const importedConfig: unknown = configPath.endsWith('eslint-length.config.mjs')
    ? bundledEslintLengthConfig
    : bundledEslintConfig;
  const overrideConfig = Array.isArray(importedConfig) ? importedConfig : await loadBundledEslintConfig(configPath);
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfig,
    overrideConfigFile: true,
    ignore: false,
  });
  const results = await eslint.lintFiles([...args]);
  const formatter = await eslint.loadFormatter('stylish');
  const output = await formatter.format(results);
  if (output) {
    process.stdout.write(output);
  }
  return results.some((result) => result.errorCount > 0 || result.fatalErrorCount > 0) ? 1 : 0;
}

function parseConfigBackedArgs(args: readonly string[]): { configPath: string; rest: string[] } {
  const configIndex = args.findIndex((arg) => arg === '--config' || arg === '-c');
  const configPath = configIndex >= 0 ? (args[configIndex + 1] ?? '') : '';
  if (!configPath) {
    throw new Error('verify: internal tool args are missing --config value');
  }
  return {
    configPath,
    rest: args.filter((_, index) => index !== configIndex && index !== configIndex + 1),
  };
}

async function runExternal(command: string, args: readonly string[]): Promise<number> {
  const result = await execa(command, args, {
    reject: false,
    all: true,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const output = result.all || [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (output) {
    process.stdout.write(`${output}\n`);
  }
  return result.exitCode || 0;
}

function parseTscArgs(args: readonly string[]): ParsedTscArgs {
  let projectPath = '';
  const compilerOptions: ParsedTscArgs['compilerOptions'] = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '--project' || arg === '-p') {
      const nextArg = args[index + 1];
      if (!nextArg) {
        throw new Error(`verify: missing value for "${arg}"`);
      }
      projectPath = nextArg;
      index += 1;
      continue;
    }
    if (arg === '--noUnusedLocals') {
      compilerOptions.noUnusedLocals = true;
      continue;
    }
    if (arg === '--noUnusedParameters') {
      compilerOptions.noUnusedParameters = true;
      continue;
    }
    throw new Error(`verify: unsupported internal tsc option "${arg}"`);
  }

  if (!projectPath) {
    throw new Error('verify: internal tsc args are missing --project value');
  }
  return { projectPath, compilerOptions };
}

function runTsc(args: readonly string[]): number {
  const parsedArgs = parseTscArgs(args);
  const configFile = ts.readConfigFile(parsedArgs.projectPath, ts.sys.readFile);
  if (configFile.error) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext([configFile.error], createTsFormatHost()));
    return 2;
  }
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    process.cwd(),
    parsedArgs.compilerOptions,
    parsedArgs.projectPath
  );
  const diagnostics = [...parsedConfig.errors];
  if (diagnostics.length === 0) {
    const program = ts.createProgram({
      rootNames: parsedConfig.fileNames,
      options: parsedConfig.options,
      projectReferences: parsedConfig.projectReferences,
    });
    diagnostics.push(...ts.getPreEmitDiagnostics(program));
  }
  if (diagnostics.length > 0) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, createTsFormatHost()));
    return 2;
  }
  return 0;
}

function createTsFormatHost(): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  };
}

function parseKnipArgs(args: readonly string[]): ParsedKnipArgs {
  const parsedConfig = parseRequiredConfigArgs(args, 'knip');
  const include: string[] = [];
  for (let index = 0; index < parsedConfig.rest.length; index += 1) {
    const arg = parsedConfig.rest[index] ?? '';
    if (arg === '--include') {
      include.push(readRequiredNextArg(parsedConfig.rest, index));
      index += 1;
      continue;
    }
    throw new Error(`verify: unsupported internal knip option "${arg}"`);
  }
  return { configPath: parsedConfig.configPath, include };
}

function countKnipIssues(counters: Record<string, number>): number {
  return Object.entries(counters)
    .filter(([key]) => key !== 'processed' && key !== 'total')
    .reduce((total, [, count]) => total + count, 0);
}

function toInternalKnipConfigPath(configPath: string, include: readonly string[]): string {
  const absoluteConfigPath = isAbsolute(configPath) ? configPath : join(process.cwd(), configPath);
  const parsedConfig: unknown = JSON.parse(readFileSync(absoluteConfigPath, 'utf-8'));
  if (typeof parsedConfig !== 'object' || parsedConfig === null || Array.isArray(parsedConfig)) {
    throw new Error(`verify: knip config "${absoluteConfigPath}" must be a JSON object`);
  }
  const internalConfigPath = join(process.cwd(), '.tmp', 'agent-quality-gate', 'knip.internal.json');
  mkdirSync(join(internalConfigPath, '..'), { recursive: true });
  writeFileSync(
    internalConfigPath,
    `${JSON.stringify({ ...parsedConfig, eslint: false, ...(include.length > 0 ? { include } : {}) }, null, 2)}\n`,
    'utf-8'
  );
  return internalConfigPath;
}

async function runKnip(args: readonly string[]): Promise<number> {
  const parsedArgs = parseKnipArgs(args);
  const options = await createKnipOptions({
    cwd: process.cwd(),
    args: {
      config: toInternalKnipConfigPath(parsedArgs.configPath, parsedArgs.include),
      include: parsedArgs.include,
      'no-progress': true,
    },
  });
  const results: Awaited<ReturnType<typeof runKnipMain>> = await runKnipMain(options);
  const issueCount = countKnipIssues(results.counters);
  if (issueCount === 0) {
    return 0;
  }
  for (const [issueType, count] of Object.entries(results.counters)) {
    if (issueType !== 'processed' && issueType !== 'total' && count > 0) {
      process.stdout.write(`${issueType} (${count})\n`);
    }
  }
  return 1;
}

export async function runInternalVerifyTool(options: InternalVerifyToolOptions): Promise<number> {
  const [toolName, ...toolArgs] = options.args;
  if (!toolName) {
    process.stderr.write(`verify: missing internal tool for step "${options.stepName}"\n`);
    return 2;
  }

  switch (toolName) {
    case 'eslint': {
      const parsed = parseConfigBackedArgs(toolArgs);
      return runEslint(
        parsed.configPath,
        parsed.rest.filter((arg) => arg !== '--no-ignore' && arg !== '--no-warn-ignored')
      );
    }
    case 'bun':
      return runExternal('bun', toolArgs);
    case 'duplicate-shapes':
      return runDuplicateShapesStep(toolArgs[0] ?? './tools/analyze/duplicate-shapes.config.json');
    case 'markdown-headings':
      return runMarkdownHeadingsStep(toolArgs);
    case 'tsc':
      return runTsc(toolArgs);
    case 'depcruise':
      return runDepcruise(toolArgs);
    case 'knip':
      return runKnip(toolArgs);
    case 'jscpd': {
      return runJscpd(toolArgs);
    }
    default:
      process.stderr.write(`verify: unknown internal tool "${toolName}" for step "${options.stepName}"\n`);
      return 2;
  }
}
