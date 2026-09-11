import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
  materializeDocumentHints,
  resolveCheckHints,
  type CheckHint,
  type ResolvedDocumentHint,
} from '../execute-verify/check-hints.js';
import type { Diagnostic } from '../execute-verify/check-result.js';
import {
  materializeHintDocs,
  parseBuiltinHintId,
  parseHintDocId,
  shortDevDepInProdHint,
  shortHint,
  type HintDocId,
} from './hint-docs.js';

const AVOID_MICRO_SPLITS_RULE_IDS = [
  'aqg/no-thin-forwarders',
  'aqg/no-trivial-const-wrappers',
  'aqg/no-identity-aliases',
  'aqg/no-useless-exported-type-aliases',
  'aqg/no-runtime-in-types-files',
] as const;

const DATABASE_BOUNDARY_RULE_IDS = [
  'database/dao-boundaries',
  'database/test-database-boundaries',
  'database-concurrent-script',
] as const;

const PLAYWRIGHT_E2E_RULE_IDS = [
  'playwright/e2e-runner',
  'playwright/e2e-black-box',
  'playwright/config',
] as const;

const HANDMADE_JSON_RULE_IDS = ['bun-parse/no-handmade-json-types'] as const;

const BUN_PARSE_JSON_RULE_IDS = [
  'bun-parse/no-handmade-json-types',
  'bun-parse/no-raw-json-parse',
  'bun-parse/no-typeof-object',
  'bun-parse/scripts-boundaries',
] as const;

const LEGACY_PARSE_EXAMPLE_RELATIVE_PATH = '.aqg/parse_example.ts';

export type FormattedStructuredHints = {
  shortLines: string[];
  builtinIds: HintDocId[];
  documents: ResolvedDocumentHint[];
};

function ruleIdMatches(ruleId: string | undefined, candidates: readonly string[]): boolean {
  if (ruleId === undefined) {
    return false;
  }
  return candidates.includes(ruleId);
}

/** Builtin short hints derived from structured diagnostic rule ids (not message text). */
export function collectRuleIdHints(diagnostics: readonly Diagnostic[] | undefined): string[] {
  const hints: string[] = [];
  const flags: RuleIdHintFlags = {
    duplication: false,
    databaseBoundary: false,
    playwrightE2e: false,
    bunParseJson: false,
    avoidMicroSplits: false,
  };
  for (const diagnostic of diagnostics ?? []) {
    noteImmediateHints(diagnostic, hints);
    noteHintFlags(diagnostic, flags);
  }
  appendFlagHints(flags, hints);
  return hints;
}

type RuleIdHintFlag =
  | 'duplication'
  | 'databaseBoundary'
  | 'playwrightE2e'
  | 'bunParseJson'
  | 'avoidMicroSplits';

type RuleIdHintFlags = Record<RuleIdHintFlag, boolean>;

const RULE_ID_FLAG_MATCHERS: readonly {
  flag: RuleIdHintFlag;
  match: (diagnostic: Diagnostic) => boolean;
}[] = [
  {
    flag: 'duplication',
    match: (diagnostic) =>
      diagnostic.ruleId === 'code-duplication' || diagnostic.ruleId === 'test-production-copy',
  },
  {
    flag: 'databaseBoundary',
    match: (diagnostic) =>
      ruleIdMatches(diagnostic.ruleId, DATABASE_BOUNDARY_RULE_IDS) ||
      diagnostic.ruleId === 'database-committed-migration',
  },
  {
    flag: 'playwrightE2e',
    match: (diagnostic) => ruleIdMatches(diagnostic.ruleId, PLAYWRIGHT_E2E_RULE_IDS),
  },
  {
    flag: 'bunParseJson',
    match: (diagnostic) =>
      ruleIdMatches(diagnostic.ruleId, BUN_PARSE_JSON_RULE_IDS) ||
      ruleIdMatches(diagnostic.ruleId, HANDMADE_JSON_RULE_IDS),
  },
  {
    flag: 'avoidMicroSplits',
    match: (diagnostic) => ruleIdMatches(diagnostic.ruleId, AVOID_MICRO_SPLITS_RULE_IDS),
  },
];

const RULE_ID_FLAG_HINTS: readonly { flag: RuleIdHintFlag; hintId: HintDocId }[] = [
  { flag: 'duplication', hintId: 'code-duplication' },
  { flag: 'databaseBoundary', hintId: 'database-boundary' },
  { flag: 'playwrightE2e', hintId: 'playwright-e2e' },
  { flag: 'bunParseJson', hintId: 'bun-parse-json' },
  { flag: 'avoidMicroSplits', hintId: 'avoid-micro-splits' },
];

function noteImmediateHints(diagnostic: Diagnostic, hints: string[]): void {
  if (diagnostic.ruleId === 'dev-dep-in-prod') {
    hints.push(shortDevDepInProdHint(diagnostic.message));
  }
  if (diagnostic.ruleId === 'database-committed-migration') {
    hints.push(shortHint('database-committed-migration'));
  }
}

function noteHintFlags(diagnostic: Diagnostic, flags: RuleIdHintFlags): void {
  for (const matcher of RULE_ID_FLAG_MATCHERS) {
    if (matcher.match(diagnostic)) {
      flags[matcher.flag] = true;
    }
  }
}

function appendFlagHints(flags: RuleIdHintFlags, hints: string[]): void {
  for (const entry of RULE_ID_FLAG_HINTS) {
    if (flags[entry.flag]) {
      hints.push(shortHint(entry.hintId));
    }
  }
}

function hintDocIdsFromLines(lines: readonly string[]): HintDocId[] {
  const ids: HintDocId[] = [];
  for (const line of lines) {
    const id = parseHintDocId(line);
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return ids;
}

export function formatStructuredHints(hints: readonly CheckHint[]): FormattedStructuredHints {
  const resolved = resolveCheckHints(hints);
  const shortLines: string[] = [];
  const builtinIds: HintDocId[] = [];
  const documents: ResolvedDocumentHint[] = [];
  for (const hint of resolved) {
    if (hint.kind === 'builtin') {
      const id = parseBuiltinHintId(hint.id);
      if (id === undefined) {
        throw new Error(`unknown builtin hint id: ${hint.id}`);
      }
      builtinIds.push(id);
      shortLines.push(shortHint(id));
      continue;
    }
    documents.push(hint);
    shortLines.push(hint.shortLine);
  }
  return { shortLines, builtinIds, documents };
}

export function dedupeShortHintLines(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    unique.push(line);
  }
  return unique;
}

async function removeLegacyParseExample(projectRoot: string): Promise<void> {
  try {
    await unlink(join(projectRoot, LEGACY_PARSE_EXAMPLE_RELATIVE_PATH));
  } catch {
    // Legacy cleanup is best-effort; hint materialization must still succeed.
  }
}

export async function materializeFollowUpArtifacts(
  projectRoot: string,
  shortHintLines: readonly string[],
  structured: FormattedStructuredHints | undefined,
  handmadeJson = false,
): Promise<void> {
  if (handmadeJson) {
    await removeLegacyParseExample(projectRoot);
  }
  await materializeHintDocs(projectRoot, [
    ...hintDocIdsFromLines(shortHintLines),
    ...(structured?.builtinIds ?? []),
  ]);
  if (structured !== undefined && structured.documents.length > 0) {
    await materializeDocumentHints(projectRoot, structured.documents);
  }
}
