import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { writeTextFile } from '#system/process/files/files.js';
export const AQG_HINTS_DIRECTORY = '.aqg/hints';

const CODE_DUPLICATION = `# code-duplication

Deduplicate the listed file ranges (extract shared helpers).

Do not change duplication thresholds or search for jscpd.
`;

const TYPE_AWARE_TIMEOUT = `# type-aware-timeout

oxlint type-aware (tsgo) exceeded the verify timeout and was killed.

Run \`tsc --noEmit\` to find circular imports, then retry verify.

Do not wait for tsgo.
`;

const DEV_DEP_IN_PROD = `# dev-dep-in-prod

A package listed under \`devDependencies\` is imported from production code.

Move that package from \`devDependencies\` to \`dependencies\`.
`;

export const HINT_DOC_IDS = ['code-duplication', 'type-aware-timeout', 'dev-dep-in-prod'] as const;

export type HintDocId = (typeof HINT_DOC_IDS)[number];

export const HINT_DOCUMENTS: Record<HintDocId, { path: string; body: string }> = {
  'code-duplication': {
    path: `${AQG_HINTS_DIRECTORY}/code-duplication.md`,
    body: CODE_DUPLICATION,
  },
  'type-aware-timeout': {
    path: `${AQG_HINTS_DIRECTORY}/type-aware-timeout.md`,
    body: TYPE_AWARE_TIMEOUT,
  },
  'dev-dep-in-prod': {
    path: `${AQG_HINTS_DIRECTORY}/dev-dep-in-prod.md`,
    body: DEV_DEP_IN_PROD,
  },
};

export function shortHint(id: HintDocId): string {
  return `hint:${id} — ${HINT_DOCUMENTS[id].path}`;
}

export function shortDevDepInProdHint(packageName: string): string {
  return `hint:dev-dep-in-prod:${packageName} — ${HINT_DOCUMENTS['dev-dep-in-prod'].path}`;
}

export function parseHintDocId(line: string): HintDocId | undefined {
  const id = /^hint:([a-z0-9-]+)/u.exec(line.trim())?.[1];
  if (id === undefined) {
    return undefined;
  }
  return HINT_DOC_IDS.find((candidate) => candidate === id);
}

export function parseBuiltinHintId(id: string): HintDocId | undefined {
  return HINT_DOC_IDS.find((candidate) => candidate === id);
}

export async function materializeHintDocs(
  projectRoot: string,
  ids: readonly HintDocId[],
): Promise<void> {
  const unique = [...new Set(ids)];
  await Promise.all(
    unique.map(async (id) => {
      const doc = HINT_DOCUMENTS[id];
      const absolute = join(projectRoot, doc.path);
      mkdirSync(dirname(absolute), { recursive: true });
      await writeTextFile(absolute, doc.body);
    }),
  );
}
