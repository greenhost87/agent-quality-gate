import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { Detector, MemoryStore, Statistic, getDefaultOptions, getModeHandler } from '../../node_modules/@jscpd/core/dist/index.js';
import { Tokenizer, getFormatByFile, getSupportedFormats } from '../../node_modules/@jscpd/tokenizer/dist/index.js';
import ts from 'typescript';
import type {
  DetectorEvents,
  IClone,
  IEventPayload,
  IMapFrame,
  IOptions,
  IStatistic,
} from '../../node_modules/@jscpd/core/dist/index.js';

import { parseRequiredConfigArgs } from './internal-args.js';
import type { JscpdJsonConfig, ParsedJscpdArgs } from './internal-tools.types.js';

const BOLD_START = '\u001B[1m';
const BOLD_END = '\u001B[22m';

function parseJscpdArgs(args: readonly string[]): ParsedJscpdArgs {
  const parsedConfig = parseRequiredConfigArgs(args, 'jscpd');
  for (const arg of parsedConfig.rest) {
    if (arg.startsWith('-')) {
      throw new Error(`verify: unsupported internal jscpd option "${arg}"`);
    }
  }
  return { configPath: parsedConfig.configPath, targets: parsedConfig.rest };
}

function parseCommaList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
}

function isJscpdJsonConfig(value: unknown): value is JscpdJsonConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJscpdJsonConfig(filePath: string): JscpdJsonConfig {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (!isJscpdJsonConfig(parsed)) {
    throw new Error(`verify: jscpd config "${filePath}" must be a JSON object`);
  }
  return parsed;
}

function resolveConfigRelativePath(configDir: string, filePath: string): string {
  if (isAbsolute(filePath) || filePath.startsWith('**/')) {
    return filePath;
  }
  const absolutePath = ts.sys.resolvePath(resolve(configDir, filePath));
  const cwd = ts.sys.resolvePath(process.cwd());
  if (absolutePath.startsWith(cwd)) {
    return absolutePath.slice(cwd.length + 1) || '.';
  }
  return absolutePath;
}

function toGitignoreGlobs(): string[] {
  const gitignorePath = join(process.cwd(), '.gitignore');
  if (!existsSync(gitignorePath)) {
    return [];
  }
  return readFileSync(gitignorePath, 'utf-8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'))
    .flatMap((line) => {
      const normalized = line.replace(/^\/+/u, '');
      if (normalized.endsWith('/')) {
        return [`**/${normalized}**/*`, `${normalized}**/*`];
      }
      return [`**/${normalized}`, normalized];
    });
}

function toJscpdOptions(configPath: string, targets: readonly string[]): IOptions {
  const absoluteConfigPath = isAbsolute(configPath) ? configPath : join(process.cwd(), configPath);
  const config = readJscpdJsonConfig(absoluteConfigPath);
  const configDir = absoluteConfigPath.includes('/.tmp/agent-quality-gate/embedded-default-configs/')
    ? process.cwd()
    : dirname(absoluteConfigPath);
  const configuredIgnore =
    parseCommaList(config.ignore)?.map((pattern) => resolveConfigRelativePath(configDir, pattern)) ?? [];
  const reporters = parseCommaList(config.reporters) ?? [];
  const output = typeof config.output === 'string' ? resolveConfigRelativePath(configDir, config.output) : config.output;

  return {
    ...getDefaultOptions(),
    ...config,
    config: absoluteConfigPath,
    path:
      targets.length > 0
        ? [...targets]
        : parseCommaList(config.path)?.map((target) => resolveConfigRelativePath(configDir, target)),
    format: parseCommaList(config.format) ?? getSupportedFormats(),
    ignore: [...configuredIgnore, ...(config.gitignore === true ? toGitignoreGlobs() : [])],
    output,
    reporters,
    ...(typeof config.mode === 'string' ? { mode: getModeHandler(config.mode) } : {}),
    hashFunction: (value: string) => createHash('md5').update(value).digest('hex'),
  };
}

function toDisplayedPath(filePath: string, options: IOptions): string {
  return options.absolute ? filePath : relative(process.cwd(), filePath);
}

function matchesGlob(filePath: string, pattern: string): boolean {
  return new Bun.Glob(pattern).match(filePath);
}

function shouldIgnoreFile(filePath: string, options: IOptions): boolean {
  return (options.ignore ?? []).some((pattern) => matchesGlob(filePath, pattern));
}

function collectJscpdFiles(target: string, options: IOptions, files: string[]): void {
  if (!existsSync(target) || shouldIgnoreFile(target, options)) {
    return;
  }
  const stats = statSync(target);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(target)) {
      collectJscpdFiles(join(target, entry), options, files);
    }
    return;
  }
  if (stats.isFile()) {
    files.push(target);
  }
}

function resolveJscpdFiles(options: IOptions): string[] {
  const files: string[] = [];
  for (const target of options.path ?? []) {
    collectJscpdFiles(target, options, files);
  }
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

function reportClone(clone: IClone, options: IOptions): void {
  const duplicationA = clone.duplicationA;
  const duplicationB = clone.duplicationB;
  process.stdout.write(
    [
      `Clone found (${clone.format}):`,
      ` - ${toDisplayedPath(duplicationA.sourceId, options)} ` +
        `[${duplicationA.start.line}:${duplicationA.start.column} - ${duplicationA.end.line}:${duplicationA.end.column}]`,
      `   ${toDisplayedPath(duplicationB.sourceId, options)} ` +
        `[${duplicationB.start.line}:${duplicationB.start.column} - ${duplicationB.end.line}:${duplicationB.end.column}]`,
      '',
    ].join('\n')
  );
}

function reportJscpdSummary(clones: readonly IClone[], statistic: Statistic): void {
  const stats = statistic.getStatistic();
  process.stdout.write(
    [
      `Duplications detection: Found ${BOLD_START}${clones.length}${BOLD_END} exact clones with ` +
        `${BOLD_START}${stats.total.duplicatedLines}${BOLD_END}(${stats.total.percentage}%) duplicated lines ` +
        `in ${BOLD_START}${stats.total.sources}${BOLD_END} (${Object.keys(stats.formats).length} formats) files.`,
      `Found ${clones.length} clones.`,
    ].join('\n') + '\n'
  );
}

function addCloneFragments(clone: IClone): IClone {
  const start = clone.duplicationA.start.line - 1;
  const end = clone.duplicationA.end.line;
  const fragment = readFileSync(clone.duplicationA.sourceId, 'utf-8').split(/\r?\n/u).slice(start, end).join('\n');
  return {
    ...clone,
    duplicationA: { ...clone.duplicationA, fragment },
    duplicationB: { ...clone.duplicationB, fragment },
  };
}

function writeJsonReport(clones: readonly IClone[], statistic: IStatistic, options: IOptions): void {
  const output = typeof options.output === 'string' ? options.output : '.jscpd';
  mkdirSync(output, { recursive: true });
  const duplicates = clones.map((clone) => ({
    format: clone.format,
    lines: clone.duplicationA.end.line - clone.duplicationA.start.line + 1,
    fragment: clone.duplicationA.fragment ?? '',
    tokens: 0,
    firstFile: {
      name: toDisplayedPath(clone.duplicationA.sourceId, options),
      start: clone.duplicationA.start.line,
      end: clone.duplicationA.end.line,
      startLoc: clone.duplicationA.start,
      endLoc: clone.duplicationA.end,
    },
    secondFile: {
      name: toDisplayedPath(clone.duplicationB.sourceId, options),
      start: clone.duplicationB.start.line,
      end: clone.duplicationB.end.line,
      startLoc: clone.duplicationB.start,
      endLoc: clone.duplicationB.end,
    },
  }));
  writeFileSync(join(output, 'jscpd-report.json'), JSON.stringify({ statistics: statistic, duplicates }, null, '  '));
  process.stdout.write(`JSON report saved to ${join(output, 'jscpd-report.json')}\n`);
}

async function detectJscpdClones(options: IOptions, statistic: Statistic): Promise<IClone[]> {
  const store = new MemoryStore<IMapFrame>();
  const detector = new Detector(new Tokenizer(), store, [], options);
  const statisticHandlers = statistic.subscribe();
  const detectorEvents: DetectorEvents[] = ['CLONE_FOUND', 'CLONE_SKIPPED', 'START_DETECTION'];
  for (const event of detectorEvents) {
    const handler = statisticHandlers[event];
    if (handler) {
      detector.on(event, handler);
    }
  }
  const cloneFoundEvent: DetectorEvents = 'CLONE_FOUND';
  detector.on(cloneFoundEvent, (payload: IEventPayload) => {
    if (!options.silent && payload.clone) {
      reportClone(payload.clone, options);
    }
  });
  const clones: IClone[] = [];
  for (const filePath of resolveJscpdFiles(options)) {
    const format = getFormatByFile(filePath, options.formatsExts);
    if (
      !format ||
      !options.format?.includes(format) ||
      shouldIgnoreFile(filePath, options) ||
      !existsSync(filePath) ||
      !statSync(filePath).isFile()
    ) {
      continue;
    }
    const content = readFileSync(filePath, 'utf-8');
    clones.push(...(await detector.detect(filePath, content, format)));
  }
  store.close();
  return clones.map(addCloneFragments);
}

export async function runJscpd(args: readonly string[]): Promise<number> {
  const parsedArgs = parseJscpdArgs(args);
  const options = toJscpdOptions(parsedArgs.configPath, parsedArgs.targets);
  const statistic = new Statistic();
  const reporters = parseCommaList(options.reporters) ?? [];
  const clones = await detectJscpdClones(options, statistic);
  const stats = statistic.getStatistic();
  if (reporters.includes('json')) {
    writeJsonReport(clones, stats, options);
  }
  if (reporters.includes('console') || reporters.includes('silent')) {
    reportJscpdSummary(clones, statistic);
  }
  const threshold = typeof options.threshold === 'number' ? options.threshold : undefined;
  const percentage = stats.total.percentage;
  if (threshold !== undefined && threshold < percentage) {
    process.stderr.write(`ERROR: jscpd found too many duplicates (${percentage}%) over threshold (${threshold}%)\n`);
    return typeof options.exitCode === 'number' && options.exitCode > 0 ? options.exitCode : 1;
  }
  return clones.length > 0 && threshold === undefined ? 1 : 0;
}
