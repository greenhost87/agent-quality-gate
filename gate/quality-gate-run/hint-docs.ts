import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { writeTextFile } from '../../process/files/files.js';

export const AQG_HINTS_DIRECTORY = '.aqg/hints';

const LIVE_UI_SURFACE = `# live-ui-surface

Remove the dead UI option from its prop type, CVA branch, render branch, and associated classes.

For an unused theme token, remove its \`@theme\` mapping and unreferenced backing variables.

Do not add artificial call sites.
`;

const PRESENTATION_DUPLICATION = `# presentation-duplication

Reuse the existing shared primitive at each call site with explicit props (for example \`Button\` with \`variant\`, or \`Input\` with \`type\` and \`step\`).

Add a new shared component only when a smaller interface hides real composition or behavior.

Do not create a presentation adapter that only renames or re-lists props of \`Button\`/\`Input\`.

Do not change detector thresholds or copy the markup elsewhere.
`;

const CODE_DUPLICATION = `# code-duplication

Deduplicate the listed file ranges (extract shared helpers).

Do not change duplication thresholds or search for jscpd.
`;

const DATABASE_BOUNDARY = `# database-boundary

Use an already production-reachable module for Arrange and observation.

Do not create or expand a DAO solely for a test.

When no production path exists, stop and report the missing path as a blocker.

Also see \`.aqg/database/database-examples.md\` for DAO / cache / integration-test shape.
`;

const PLAYWRIGHT_E2E = `# playwright-e2e

Use Playwright Test:

- specs at \`tests/e2e/*.pw.ts\`
- \`page\` fixture
- \`webServer\` and \`baseURL\` in \`playwright.config.ts\`

For Postgres, follow the Playwright webServer note in \`scripts/playwright-web-server.ts\`.
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

const DATABASE_COMMITTED_MIGRATION = `# database-committed-migration

Edited migration files already present in git HEAD were restored to HEAD.

Copy the intended change from \`.aqg/restored-migration.diff\` into a **new** migration file under \`migrations/\`.

Do not re-edit the restored committed migration files.
`;

const SINGLE_CONSUMER = `# single-consumer

The listed module has exactly one importer in the project import graph.

Inline or fold it into that sole caller (or give it a second real production consumer).

Do not add artificial call sites, and do not change fallow / verify tooling to silence the finding.

Also read \`.aqg/hints/avoid-micro-splits.md\` before carving a long file into more modules.
`;

const AVOID_MICRO_SPLITS = `# avoid-micro-splits

A long file is not a reason to carve out a new micro-module.

Do not react to file length by extracting every function into its own \`.helpers.ts\`, \`.lib.ts\`, or sibling \`*.types.ts\` beside the caller.

## Prefer

- Keep cohesive domain logic together until a real boundary appears (shared reuse, deployment boundary, test isolation worth the split).
- Extract one meaningful unit with a stable API and multiple expected callers — not a 5–20 line wrapper file.
- Inline into the sole caller when only one module needs the code (\`single-consumer\` findings).

## Avoid

- New files whose only job is to shorten a parent file.
- \`foo.helpers.ts\` / \`foo-lib.ts\` chains where each file has a single importer.
- Splitting types, constants, and one-liner wrappers into separate files in the same feature folder.

When verify lists \`single-consumer:\`, merge those modules back into the caller or into a shared module with real reuse.

Baseline rules that also emit this hint: \`aqg/no-thin-forwarders\`, \`aqg/no-trivial-const-wrappers\`, \`aqg/no-identity-aliases\`, \`aqg/no-useless-exported-type-aliases\`, \`aqg/no-runtime-in-types-files\`.

Do not add artificial importers or change verify thresholds to silence findings.
`;

const BUN_PARSE_JSON = `# bun-parse-json

Read this file when verify reports \`bun-parse/no-raw-json-parse\`, \`bun-parse/no-typeof-object\`, \`bun-parse/no-handmade-json-types\`, or \`bun-parse/scripts-boundaries\`.

Do not scan transcripts or git history for prior fixes — apply the recipes below in the listed source files.

## Banned (outside \`tests/\`)

- \`JSON.parse\`, \`request.json()\`, \`response.json()\`
- \`v.parse(v.pipe(v.string(), v.parseJson()), …)\` without a domain schema in the same pipe
- \`typeof value === 'object'\` (and \`Array.isArray(value)\` when \`presetConfig.bun-parse.typeofObjectMode\` is \`strict\`, the default), plus the combo \`typeof … && … !== null && !Array.isArray(…)\`
- Recursive JSON type aliases (\`type JsonValue = … | JsonValue[]\`)
- \`v.record(v.string(), v.unknown())\`, \`readJsonObject\`, and exported \`object\` / \`Record<string, unknown>\` parse helpers
- Importing from \`scripts/\` in production code

## Replace handmade JSON types

Define the runtime schema first and infer its TypeScript type. Parse the Bun result as \`unknown\`:

\`\`\`ts
import * as v from 'valibot';

const ExampleSchema = v.object({
  name: v.string(),
  enabled: v.optional(v.boolean(), false),
});

export type Example = v.InferOutput<typeof ExampleSchema>;

export async function readExample(path: string): Promise<Example> {
  const raw: unknown = await Bun.file(path).json();
  const result = v.safeParse(ExampleSchema, raw);
  if (!result.success) {
    throw new Error(\`\${path}: \${result.issues[0].message}\`);
  }
  return result.output;
}
\`\`\`

Never hand-roll \`JsonValue\` / \`JsonObject\` unions.

## Client fetch responses

Do not use \`readJsonObject\`, \`v.record(v.string(), v.unknown())\`, or \`isPlainObject\` to accept arbitrary JSON and then read fields with \`Reflect.get\`. Define the API response schema and parse in one step:

\`\`\`ts
const MailingListResponseSchema = v.object({
  items: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      status: v.string(),
    }),
  ),
  total: v.number(),
  pages: v.number(),
});

const body = await parseJsonResponse(response, MailingListResponseSchema);
\`\`\`

Export \`type MailingListResponse = v.InferOutput<typeof MailingListResponseSchema>\` when the type is shared.

## Fix typeof / Array.isArray (server **and** client)

You already have \`unknown\`. Delete the guard and validate with valibot:

\`\`\`ts
import * as v from 'valibot';

const PackageSchema = v.object({
  scripts: v.optional(v.record(v.string(), v.string())),
});

export type PackageJson = v.InferOutput<typeof PackageSchema>;

export function readPackage(raw: unknown): PackageJson {
  return v.parse(PackageSchema, raw);
}
\`\`\`

**Wrong** (triggers \`no-typeof-object\`):

\`\`\`ts
if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
  return {};
}
return parsed;
\`\`\`

Use \`v.safeParse\` only when you need a fallback message; do not reintroduce typeof guards.

## Server-only: JSON files (Bun runtime)

Use in \`scripts/\`, route handlers, \`system/\`, CLI — anywhere Bun runs, **not** in \`'use client'\` modules:

\`\`\`ts
const raw: unknown = await Bun.file(path).json();
return v.parse(ConfigSchema, raw);
\`\`\`

\`import { file } from 'bun'\` + \`file(path).json()\` is equivalent.

## Server-only: Next.js \`Request\` / \`Response\` bodies

In \`app/api/**/route.ts\`, server actions, and other server-only modules:

\`\`\`ts
export async function parseJsonBody<const TSchema extends v.GenericSchema>(
  request: Request,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  return v.parse(v.pipe(v.string(), v.parseJson(), schema), await request.text());
}

export async function parseJsonResponse<const TSchema extends v.GenericSchema>(
  response: Response,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  return v.parse(v.pipe(v.string(), v.parseJson(), schema), await response.text());
}
\`\`\`

Keep one shared helper in a production module (for example \`system/\` or a domain package). Never under \`scripts/\`. Do not split JSON text parsing and domain validation into two \`v.parse\` calls.

## Client (\`'use client'\`, browser bundles)

Bun APIs are **not** available. Do not add \`Bun.file\` here.

- Prefer Server Components or your own \`app/api\` routes that already return valibot-validated JSON.
- If the client already receives \`unknown\`, only \`v.parse\` / \`v.safeParse\` — never typeof / \`Array.isArray\` guards.
- Do not add client \`fetch\` + manual JSON parsing for your own backend; call a typed route handler instead.

## Types

\`\`\`ts
export type Config = v.InferOutput<typeof ConfigSchema>;
\`\`\`

Never hand-roll \`JsonValue\` / \`JsonObject\` unions.
`;

export const HINT_DOC_IDS = [
  'live-ui-surface',
  'presentation-duplication',
  'code-duplication',
  'database-boundary',
  'playwright-e2e',
  'type-aware-timeout',
  'dev-dep-in-prod',
  'database-committed-migration',
  'single-consumer',
  'avoid-micro-splits',
  'bun-parse-json',
] as const;

export type HintDocId = (typeof HINT_DOC_IDS)[number];

export const HINT_DOCUMENTS: Record<HintDocId, { path: string; body: string }> = {
  'live-ui-surface': {
    path: `${AQG_HINTS_DIRECTORY}/live-ui-surface.md`,
    body: LIVE_UI_SURFACE,
  },
  'presentation-duplication': {
    path: `${AQG_HINTS_DIRECTORY}/presentation-duplication.md`,
    body: PRESENTATION_DUPLICATION,
  },
  'code-duplication': {
    path: `${AQG_HINTS_DIRECTORY}/code-duplication.md`,
    body: CODE_DUPLICATION,
  },
  'database-boundary': {
    path: `${AQG_HINTS_DIRECTORY}/database-boundary.md`,
    body: DATABASE_BOUNDARY,
  },
  'playwright-e2e': {
    path: `${AQG_HINTS_DIRECTORY}/playwright-e2e.md`,
    body: PLAYWRIGHT_E2E,
  },
  'type-aware-timeout': {
    path: `${AQG_HINTS_DIRECTORY}/type-aware-timeout.md`,
    body: TYPE_AWARE_TIMEOUT,
  },
  'dev-dep-in-prod': {
    path: `${AQG_HINTS_DIRECTORY}/dev-dep-in-prod.md`,
    body: DEV_DEP_IN_PROD,
  },
  'database-committed-migration': {
    path: `${AQG_HINTS_DIRECTORY}/database-committed-migration.md`,
    body: DATABASE_COMMITTED_MIGRATION,
  },
  'single-consumer': {
    path: `${AQG_HINTS_DIRECTORY}/single-consumer.md`,
    body: SINGLE_CONSUMER,
  },
  'avoid-micro-splits': {
    path: `${AQG_HINTS_DIRECTORY}/avoid-micro-splits.md`,
    body: AVOID_MICRO_SPLITS,
  },
  'bun-parse-json': {
    path: `${AQG_HINTS_DIRECTORY}/bun-parse-json.md`,
    body: BUN_PARSE_JSON,
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
