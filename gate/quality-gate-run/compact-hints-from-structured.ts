import {
  resolveCheckHints,
  type CheckHint,
  type ResolvedDocumentHint,
} from '../execute-verify/check-hints.js';
import { parseHintDocId, shortHint } from './hint-docs.js';

/** Turn structured VerifyResult hints into compact follow-up lines and document payloads. */
export function compactHintsFromStructured(hints: readonly CheckHint[] | undefined): {
  lines: string[];
  documents: ResolvedDocumentHint[];
} {
  if (hints === undefined || hints.length === 0) {
    return { lines: [], documents: [] };
  }
  const lines: string[] = [];
  const documents: ResolvedDocumentHint[] = [];
  for (const hint of resolveCheckHints(hints)) {
    if (hint.kind === 'document') {
      lines.push(hint.shortLine);
      documents.push(hint);
      continue;
    }
    const id = parseHintDocId(`hint:${hint.id}`);
    if (id !== undefined) {
      lines.push(shortHint(id));
    }
  }
  return { lines, documents };
}
