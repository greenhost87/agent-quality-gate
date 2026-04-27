import fs from 'node:fs';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import enhancedResolve from 'enhanced-resolve';

import { parseRequiredConfigArgs } from './internal-args.js';
import type { DepcruiseConfig, DepcruiseOptions, ParsedDepcruiseArgs } from './internal-tools.types.js';

const CRUISABLE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.d.ts'];

function parseDepcruiseArgs(args: readonly string[]): ParsedDepcruiseArgs {
  const parsedConfig = parseRequiredConfigArgs(args, 'depcruise');
  for (const arg of parsedConfig.rest) {
    if (arg.startsWith('-')) {
      throw new Error(`verify: unsupported internal depcruise option "${arg}"`);
    }
  }
  return { configPath: parsedConfig.configPath, targets: parsedConfig.rest };
}

function isDepcruiseConfig(value: unknown): value is DepcruiseConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadDepcruiseConfig(configPath: string): Promise<DepcruiseConfig> {
  const configModule: unknown = await import(pathToFileURL(configPath).href);
  const config = isDepcruiseConfig(configModule) && 'default' in configModule ? configModule.default : configModule;
  if (!isDepcruiseConfig(config)) {
    throw new Error(`verify: depcruise config "${configPath}" must export an object`);
  }
  return config;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function matchesPattern(filePath: string, pattern: string | RegExp | undefined): boolean {
  if (!pattern) {
    return false;
  }
  return new RegExp(pattern).test(filePath);
}

function collectFiles(target: string, excludePattern: string | RegExp | undefined, files: string[]): void {
  if (!existsSync(target) || matchesPattern(normalizePath(target), excludePattern)) {
    return;
  }
  const stats = statSync(target);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target)) {
      collectFiles(join(target, entry), excludePattern, files);
    }
    return;
  }
  if (stats.isFile() && CRUISABLE_EXTENSIONS.has(extname(target))) {
    files.push(normalizePath(target));
  }
}

function resolveTargets(targets: readonly string[], excludePattern: string | RegExp | undefined): string[] {
  const files: string[] = [];
  for (const target of targets.length > 0 ? targets : ['src']) {
    collectFiles(target, excludePattern, files);
  }
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

function createResolveOptions(): object {
  return {
    symlinks: true,
    extensions: RESOLVE_EXTENSIONS,
    modules: ['node_modules', 'node_modules/@types'],
    exportsFields: [],
    fileSystem: new enhancedResolve.CachedInputFileSystem(fs, 4000),
    useSyncFileSystemCalls: true,
    combinedDependencies: false,
    resolveLicenses: false,
    resolveDeprecations: false,
  };
}

function isNormalizeRuleSetModule(value: unknown): value is { default: (ruleSet: object) => object } {
  return typeof value === 'object' && value !== null && 'default' in value && typeof value.default === 'function';
}

function isExtractModule(value: unknown): value is {
  default: (targets: string[], cruiseOptions: object, resolveOptions: object, transpileOptions: object) => object[];
} {
  return typeof value === 'object' && value !== null && 'default' in value && typeof value.default === 'function';
}

function isAnalyzeModule(value: unknown): value is {
  default: (modules: object[], options: object, targets: string[]) => object;
} {
  return typeof value === 'object' && value !== null && 'default' in value && typeof value.default === 'function';
}

function isErrorReporterModule(value: unknown): value is {
  default: (result: object, options: object) => { exitCode: number; output: string };
} {
  return typeof value === 'object' && value !== null && 'default' in value && typeof value.default === 'function';
}

function isNormalizeCruiseOptionsModule(value: unknown): value is {
  normalizeCruiseOptions: (options: object, targets?: string[]) => DepcruiseOptions;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'normalizeCruiseOptions' in value &&
    typeof value.normalizeCruiseOptions === 'function'
  );
}

async function loadNormalizeCruiseOptions(): Promise<(options: object, targets?: string[]) => DepcruiseOptions> {
  const importedModule: unknown = await import('../../node_modules/dependency-cruiser/src/main/options/normalize.mjs');
  if (!isNormalizeCruiseOptionsModule(importedModule)) {
    throw new Error('verify: dependency-cruiser normalizeCruiseOptions is unavailable');
  }
  return importedModule.normalizeCruiseOptions;
}

async function loadNormalizeRuleSet(): Promise<(ruleSet: object) => object> {
  const importedModule: unknown = await import('../../node_modules/dependency-cruiser/src/main/rule-set/normalize.mjs');
  if (!isNormalizeRuleSetModule(importedModule)) {
    throw new Error('verify: dependency-cruiser rule-set normalize is unavailable');
  }
  return importedModule.default;
}

async function loadExtract(): Promise<
  (targets: string[], cruiseOptions: object, resolveOptions: object, transpileOptions: object) => object[]
> {
  const importedModule: unknown = await import('../../node_modules/dependency-cruiser/src/extract/index.mjs');
  if (!isExtractModule(importedModule)) {
    throw new Error('verify: dependency-cruiser extract is unavailable');
  }
  return importedModule.default;
}

async function loadAnalyze(): Promise<(modules: object[], options: object, targets: string[]) => object> {
  const importedModule: unknown = await import('../../node_modules/dependency-cruiser/src/analyze/index.mjs');
  if (!isAnalyzeModule(importedModule)) {
    throw new Error('verify: dependency-cruiser analyze is unavailable');
  }
  return importedModule.default;
}

async function loadErrorReporter(): Promise<(result: object, options: object) => { exitCode: number; output: string }> {
  const importedModule: unknown = await import('../../node_modules/dependency-cruiser/src/report/error.mjs');
  if (!isErrorReporterModule(importedModule)) {
    throw new Error('verify: dependency-cruiser error reporter is unavailable');
  }
  return importedModule.default;
}

export async function runDepcruise(args: readonly string[]): Promise<number> {
  const parsedArgs = parseDepcruiseArgs(args);
  const config = await loadDepcruiseConfig(parsedArgs.configPath);
  const configOptions = config.options ?? {};
  const normalizeRuleSet = await loadNormalizeRuleSet();
  const normalizeCruiseOptions = await loadNormalizeCruiseOptions();
  const cruiseOptions = normalizeCruiseOptions(
    {
      ...configOptions,
      ruleSet: normalizeRuleSet({
        forbidden: config.forbidden,
        allowed: config.allowed,
        required: config.required,
      }),
      outputType: 'err',
    },
    parsedArgs.targets
  );
  const targets = resolveTargets(parsedArgs.targets, cruiseOptions.exclude.path);
  const extract = await loadExtract();
  const analyze = await loadAnalyze();
  const errorReporter = await loadErrorReporter();
  const modules = extract(targets, cruiseOptions, createResolveOptions(), {});
  const result = analyze(modules, cruiseOptions, targets);
  const report = errorReporter(result, {});
  if (report.output) {
    process.stdout.write(String(report.output));
  }
  return report.exitCode;
}
