import { join } from 'node:path';

import * as v from 'valibot';

import { readJsonFile } from '../../../process/files/files.js';

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
  if (args.includes('json')) return 'structural';
  return 'unknown';
}

export function emptyFallowJson(args: readonly string[]): string {
  const phase = fallowPhase(args);
  if (phase === 'complexity') {
    return '{"kind":"health","findings":[]}';
  }
  if (phase === 'hygiene') {
    return '{"kind":"combined","check":{"total_issues":0},"dupes":{"clone_groups":[]}}';
  }
  return '{"kind":"dead-code","total_issues":0}';
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
