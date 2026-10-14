import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from 'bun:test';
import * as v from 'valibot';

import { executeVerify } from '#system/gate/run/execute-verify.ts';
import type {
  NodeProcessRunOptions,
  ToolRunner,
  ToolRunResult,
} from '#system/gate/run/execute-verify.ts';
import { readJsonFile, readTextFile } from '#system/process/files/files.ts';
import { checkResultFromOxlintToolRun } from '#system/gate/run/verify-tool-run.ts';
import { EXECUTE_VERIFY_FIXTURE_ENTRIES } from '#system/tests/support/execute-verify-fixture.ts';

export async function combinedRunFailure(
  projectRoot: string,
  message: string,
): Promise<string | undefined> {
  try {
    await executeVerify(fixtureVerifyRequest(projectRoot), async (options) => {
      await Promise.resolve();
      if (options.name === 'fallow' && fallowPhase(options.args) === 'combined') {
        throw new Error(message);
      }
      return emptyToolResult(options.args, options.name);
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
}

export function fixtureVerifyRequest(projectRoot: string) {
  return {
    projectRoot,
    entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
    skipPresetProjectChecks: true,
  };
}

export async function safeParseFallowRunnerConfig<const TSchema extends v.GenericSchema>(
  args: readonly string[],
  schema: TSchema,
): Promise<v.SafeParseResult<TSchema>> {
  const configPath = args[args.indexOf('--config') + 1] ?? '';
  return v.safeParse(schema, JSON.parse(await readTextFile(configPath)));
}

export function fallowPhase(args: readonly string[]): string {
  if (args.includes('--boundary-violations')) {
    return 'boundaries';
  }
  if (args.includes('--re-export-cycles') || args.includes('--unresolved-imports')) {
    return 'cycles';
  }
  if (args.includes('--complexity')) {
    return 'complexity';
  }
  const skipIndex = args.indexOf('--skip');
  if (skipIndex >= 0 && args[skipIndex + 1] === 'health') {
    return 'hygiene';
  }
  const onlyNames = args.flatMap((arg, index) => (arg === '--only' ? [args[index + 1]] : []));
  if (args[1] === 'ui') {
    return 'ui';
  }
  if (onlyNames.includes('ui') && onlyNames.includes('dupes')) {
    return 'second';
  }
  const onlyIndex = args.indexOf('--only');
  if (onlyIndex >= 0 && args[onlyIndex + 1] === 'ui') {
    return 'ui';
  }
  if (onlyIndex >= 0 && args[onlyIndex + 1] === 'dupes') {
    return 'dupes';
  }
  if (
    args.includes('--fail-on-issues') &&
    !args.includes('dead-code') &&
    !args.includes('health')
  ) {
    return 'combined';
  }
  if (args.includes('--fail-on-issues')) {
    return 'structural';
  }
  return 'unknown';
}

/** Record raw argv of every fallow tool call into `log`. */
export function recordFallowArgv(log: string[][], options: NodeProcessRunOptions): void {
  if (options.name === 'fallow') {
    log.push([...options.args]);
  }
}

/** Record the fallow phase of every fallow tool call into `log`. */
export function recordFallowPhase(log: string[], options: NodeProcessRunOptions): void {
  if (options.name === 'fallow') {
    log.push(fallowPhase(options.args));
  }
}

/** Record the cache routing of a fallow tool call for later assertions. */
export async function recordFallowCacheDirs(
  cacheEnvs: string[],
  configCacheDirs: Array<string | undefined>,
  options: NodeProcessRunOptions,
): Promise<void> {
  cacheEnvs.push(options.environment?.['FALLOW_CACHE_DIR'] ?? '');
  const parsed = await safeParseFallowRunnerConfig(
    options.args,
    v.looseObject({ cache: v.optional(v.looseObject({ dir: v.optional(v.string()) })) }),
  );
  configCacheDirs.push(parsed.success ? parsed.output.cache?.dir : undefined);
}

export function emptyFallowJson(args: readonly string[]): string {
  const phase = fallowPhase(args);
  if (phase === 'complexity') {
    return '{"kind":"health","findings":[]}';
  }
  if (phase === 'hygiene') {
    return '{"kind":"combined","check":{"total_issues":0},"dupes":{"clone_groups":[]}}';
  }
  if (phase === 'combined') {
    return '{"kind":"combined","check":{"total_issues":0},"dupes":{"clone_groups":[]},"health":{"findings":[]}}';
  }
  if (phase === 'dupes') {
    return '{"kind":"combined","dupes":{"clone_groups":[]}}';
  }
  if (phase === 'second') {
    return '{"kind":"combined","dupes":{"clone_groups":[]},"ui":{"schema_version":1,"scenarios":[],"coverage":[],"unresolved_interactions":[],"diagnostics":[],"summary":{},"completeness":{}}}';
  }
  if (phase === 'ui') {
    return '{"kind":"combined","ui":{"schema_version":1,"scenarios":[],"coverage":[],"unresolved_interactions":[],"diagnostics":[],"summary":{},"completeness":{}}}';
  }
  return '{"kind":"dead-code","total_issues":0}';
}

export type VerifyToolHandler = (
  options: NodeProcessRunOptions,
) => ToolRunResult | Promise<ToolRunResult>;

/** Dispatch stubbed tool launches by tool name; unhandled tools get empty results. */
export function stubVerifyTools(handlers: {
  fallow?: VerifyToolHandler;
  oxlint?: VerifyToolHandler;
}): ToolRunner {
  return async (options) => {
    await Promise.resolve();
    if (options.name === 'fallow' && handlers.fallow !== undefined) {
      return handlers.fallow(options);
    }
    if (options.name === 'oxlint' && handlers.oxlint !== undefined) {
      return handlers.oxlint(options);
    }
    return emptyToolResult(options.args, options.name);
  };
}

export function emptyToolResult(args: readonly string[] = [], name = 'fallow') {
  if (name === 'oxlint') {
    return { exitCode: 0, stdout: '{"diagnostics":[]}', stderr: '' };
  }
  return {
    exitCode: 0,
    stdout: emptyFallowJson(args),
    stderr: '',
  };
}

export function observingToolRun(
  observe: (options: NodeProcessRunOptions) => void | Promise<void>,
): VerifyToolHandler {
  return async (options) => {
    await observe(options);
    return emptyToolResult(options.args, options.name);
  };
}

export function cacheRecordingFallowRunner(
  cacheEnvs: string[],
  configCacheDirs: Array<string | undefined>,
): VerifyToolHandler {
  return async (options) => {
    await recordFallowCacheDirs(cacheEnvs, configCacheDirs, options);
    return emptyToolResult(options.args, options.name);
  };
}

export function recordingFallowRunner(
  log: string[][],
  run: VerifyToolHandler = (options) => emptyToolResult(options.args, options.name),
): VerifyToolHandler {
  return async (options) => {
    recordFallowArgv(log, options);
    return await run(options);
  };
}

export function ignoredOxlintCheckResult(
  exitCode: number,
  diagnostics: readonly OxlintJsonDiagnosticInput[],
  stderr: string,
) {
  return checkResultFromOxlintToolRun(
    { exitCode, stdout: JSON.stringify({ diagnostics }), stderr },
    new Set(['no-debugger']),
  );
}

export type OxlintJsonDiagnosticInput = {
  message: string;
  code: string;
  filename: string;
  line?: number;
  column?: number;
  severity?: 'error' | 'warning';
};

export type OxlintJsonDiagnosticPayload = {
  message: string;
  code: string;
  severity: 'error' | 'warning';
  filename: string;
  labels: readonly { span: { line: number; column: number } }[];
};

export function oxlintJsonDiagnostic(
  options: OxlintJsonDiagnosticInput,
): OxlintJsonDiagnosticPayload {
  return {
    message: options.message,
    code: options.code,
    severity: options.severity ?? 'error',
    filename: options.filename,
    labels: [{ span: { line: options.line ?? 1, column: options.column ?? 1 } }],
  };
}

export function oxlintJsonStdout(...diagnostics: readonly OxlintJsonDiagnosticPayload[]): string {
  return JSON.stringify({ diagnostics });
}

export function oxlintStderrResult(exitCode: number, stderr: string) {
  return { exitCode, stdout: '', stderr };
}

export function selfLoopCombinedFailureResult() {
  return fallowCombinedFailureResult({
    check: {
      total_issues: 1,
      re_export_cycles: [{ files: ['src/index.ts'], kind: 'self-loop' }],
    },
  });
}

export function deadExportCombinedFailureResult() {
  return fallowCombinedFailureResult({
    check: {
      total_issues: 1,
      unused_exports: [{ path: 'src/dead.ts', export_name: 'dead', line: 1, col: 0 }],
    },
    health: {
      findings: [{ path: 'src/index.ts', name: 'tooComplex', line: 1, cyclomatic: 99 }],
    },
  });
}

export function debuggerDiagnostic(line = 1): OxlintJsonDiagnosticPayload {
  return oxlintJsonDiagnostic({
    message: 'debugger',
    code: 'eslint(no-debugger)',
    filename: 'src/index.ts',
    line,
  });
}

export function oxlintClassFoundDiagnostic(line = 1): OxlintJsonDiagnosticPayload {
  return oxlintJsonDiagnostic({
    message: 'class found',
    code: 'aqg(no-class)',
    filename: 'src/index.ts',
    line,
  });
}

export function oxlintFailureResult(...diagnostics: readonly OxlintJsonDiagnosticPayload[]) {
  return { exitCode: 1, stdout: oxlintJsonStdout(...diagnostics), stderr: '' };
}

export function fallowCombinedFailureResult(combined: object) {
  return {
    exitCode: 1,
    stdout: JSON.stringify({
      kind: 'combined',
      dupes: { clone_groups: [] },
      health: { findings: [] },
      ...combined,
    }),
    stderr: '',
  };
}

const FallowRulesSchema = v.record(
  v.string(),
  v.union([v.string(), v.number(), v.boolean(), v.null()]),
);
export type FallowRules = v.InferOutput<typeof FallowRulesSchema>;

function isFallowRules(value: unknown): value is FallowRules {
  return v.safeParse(FallowRulesSchema, value).success;
}

export async function fallowConfigRules(args: readonly string[]): Promise<FallowRules> {
  const configIndex = args.indexOf('--config');
  const configPath = args[configIndex + 1] ?? '';
  const loaded = await readJsonFile(configPath, v.looseObject({}));
  const rules = isFallowRules(loaded['rules']) ? loaded['rules'] : undefined;
  if (rules === undefined) {
    throw new Error(`fallow config ${configPath} has no rules object`);
  }
  return rules;
}

export function ephemeralConfigDirs(projectRoot: string): { fallow: string; oxlint: string } {
  return {
    fallow: join(projectRoot, '.aqg', 'fallow'),
    oxlint: join(projectRoot, '.aqg', 'oxlint'),
  };
}

/** Assert ephemeral per-tool config directories were cleaned up after verify. */
export function expectEphemeralCleanedUp(ephemeral: { fallow: string; oxlint: string }): void {
  expect(existsSync(ephemeral.fallow)).toBe(false);
  expect(existsSync(ephemeral.oxlint)).toBe(false);
}

/** Read the `--config` argument value of a tool call, if present. */
export function configArgOf(options: NodeProcessRunOptions): string | undefined {
  return options.args[options.args.indexOf('--config') + 1];
}
