import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { writeTextFile } from '../../process/files/files.js';

/** Structured remediation hint on a check / verify result. */
export type CheckHint =
  | { kind: 'document'; id: string; body: string; owner?: string }
  | { kind: 'builtin'; id: string };

export type ResolvedDocumentHint = {
  kind: 'document';
  id: string;
  owner: string;
  body: string;
  relativePath: string;
  shortLine: string;
};

export type ResolvedBuiltinHint = {
  kind: 'builtin';
  id: string;
};

export type ResolvedCheckHint = ResolvedDocumentHint | ResolvedBuiltinHint;

export const AQG_PRESET_HINTS_DIRECTORY = '.aqg/hints/presets';

const SAFE_HINT_SEGMENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export function isSafeHintSegment(value: string): boolean {
  return SAFE_HINT_SEGMENT.test(value);
}

export function attachHintOwners(
  hints: readonly CheckHint[] | undefined,
  owner: string,
): CheckHint[] | undefined {
  if (hints === undefined || hints.length === 0) {
    return undefined;
  }
  return hints.map((hint) => {
    if (hint.kind === 'builtin') {
      return hint;
    }
    return { kind: 'document', id: hint.id, body: hint.body, owner };
  });
}

export function collectCheckHints(
  results: readonly { hints?: readonly CheckHint[] }[],
): CheckHint[] | undefined {
  const hints = results.flatMap((result) => result.hints ?? []);
  return hints.length === 0 ? undefined : hints;
}

function hintIdentity(hint: CheckHint): string {
  if (hint.kind === 'builtin') {
    return `builtin:${hint.id}`;
  }
  return `document:${hint.owner ?? ''}:${hint.id}`;
}

function documentRelativePath(owner: string, id: string): string {
  return `${AQG_PRESET_HINTS_DIRECTORY}/${owner}/${id}.md`;
}

function requireDocumentOwner(hint: Extract<CheckHint, { kind: 'document' }>): string {
  if (hint.owner === undefined || hint.owner.length === 0) {
    throw new Error(`document hint ${hint.id} is missing owner`);
  }
  if (!isSafeHintSegment(hint.owner)) {
    throw new Error(`check hint owner is unsafe: ${hint.owner}`);
  }
  return hint.owner;
}

function validateCheckHint(hint: CheckHint): void {
  if (!isSafeHintSegment(hint.id)) {
    throw new Error(`check hint id is unsafe: ${hint.id}`);
  }
  if (hint.kind === 'document') {
    requireDocumentOwner(hint);
  }
}

function assertCompatibleDuplicate(existing: CheckHint, hint: CheckHint): void {
  if (existing.kind !== 'document' || hint.kind !== 'document') {
    return;
  }
  if (existing.body === hint.body) {
    return;
  }
  throw new Error(
    `conflicting document hint body for ${requireDocumentOwner(hint)}/${hint.id}: content differs`,
  );
}

function dedupeCheckHints(hints: readonly CheckHint[]): CheckHint[] {
  const byIdentity = new Map<string, CheckHint>();
  for (const hint of hints) {
    validateCheckHint(hint);
    const identity = hintIdentity(hint);
    const existing = byIdentity.get(identity);
    if (existing === undefined) {
      byIdentity.set(identity, hint);
      continue;
    }
    assertCompatibleDuplicate(existing, hint);
  }
  return [...byIdentity.values()];
}

function toResolvedCheckHint(hint: CheckHint): ResolvedCheckHint {
  if (hint.kind === 'builtin') {
    return { kind: 'builtin', id: hint.id };
  }
  const owner = requireDocumentOwner(hint);
  const relativePath = documentRelativePath(owner, hint.id);
  return {
    kind: 'document',
    id: hint.id,
    owner,
    body: hint.body,
    relativePath,
    shortLine: `hint:${hint.id} — ${relativePath}`,
  };
}

/**
 * Deduplicate identical hints; reject unsafe ids, missing owners, and body conflicts.
 * Builtin id membership is checked by the caller against the public catalog.
 */
export function resolveCheckHints(hints: readonly CheckHint[]): ResolvedCheckHint[] {
  return dedupeCheckHints(hints).map(toResolvedCheckHint);
}

export async function materializeDocumentHints(
  projectRoot: string,
  hints: readonly ResolvedDocumentHint[],
): Promise<void> {
  const uniquePaths = new Map<string, string>();
  for (const hint of hints) {
    const existing = uniquePaths.get(hint.relativePath);
    if (existing !== undefined && existing !== hint.body) {
      throw new Error(`conflicting hint document at ${hint.relativePath}`);
    }
    uniquePaths.set(hint.relativePath, hint.body);
  }
  await Promise.all(
    [...uniquePaths.entries()].map(async ([relativePath, body]) => {
      const absolute = join(projectRoot, relativePath);
      mkdirSync(dirname(absolute), { recursive: true });
      await writeTextFile(absolute, body);
    }),
  );
}
