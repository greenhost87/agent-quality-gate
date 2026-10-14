import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
  materializeDocumentHints,
  resolveCheckHints,
  type CheckHint,
  type ResolvedDocumentHint,
} from '../run/check-hints.js';
import type { Diagnostic } from '../run/check-result.js';
import {
  materializeHintDocs,
  parseBuiltinHintId,
  parseHintDocId,
  shortDevDepInProdHint,
  shortHint,
  type HintDocId,
} from './hint-docs.js';

const LEGACY_PARSE_EXAMPLE_RELATIVE_PATH = '.aqg/parse_example.ts';

export type FormattedStructuredHints = {
  shortLines: string[];
  builtinIds: HintDocId[];
  documents: ResolvedDocumentHint[];
};

export function collectSystemHints(diagnostics: readonly Diagnostic[] | undefined): string[] {
  return (diagnostics ?? [])
    .filter((diagnostic) => diagnostic.ruleId === 'dev-dep-in-prod')
    .map((diagnostic) => shortDevDepInProdHint(diagnostic.message));
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
        shortLines.push(`hint:${hint.id}`);
      } else {
        builtinIds.push(id);
        shortLines.push(shortHint(id));
      }
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
