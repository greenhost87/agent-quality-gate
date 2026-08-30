import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { file } from 'bun';

const presetRoot = import.meta.dir;
const examplesRoot = join(presetRoot, 'examples');
const outputPath = join(presetRoot, 'payload', 'database-examples.md');

const sections: readonly ExampleSection[] = [
  {
    heading: 'Shared cache helper',
    targetPath: 'system/database/caches.ts',
    sourcePath: join(examplesRoot, 'system/database/caches.ts'),
    notes: [
      'Use when several DAOs share in-process memo that must drop on pool recycle.',
      'Import `getDatabaseGeneration` only from modules under `system/database/`.',
      'Never invent `system/database/client.ts`, `createDatabaseAccessor`, or `getDatabase()` wrappers around `sql`.',
    ],
  },
  {
    heading: 'DAO module',
    targetPath: 'system/database/<domain>/<name>.dao.ts',
    sourcePath: join(examplesRoot, 'system/database/orders/orders.dao.ts'),
    notes: [
      'Exactly one domain segment under `system/database/`.',
      'Import lazy `sql` from `@/system/database/connection` and call it directly.',
      'Build dynamic filtering and sorting with tagged SQL fragments; never use `.unsafe()` outside managed database infrastructure.',
      'Before passing a dynamic value list to `sql(values)` / `tx(values)`, handle empty input explicitly: return an empty result or no-op for match-none semantics, or omit the clause when empty means no filter.',
      'Export only named function declarations and types — no classes, default exports, or object bags.',
      'For optional reads, use `rows[0] ?? null`; map the first row inline when needed.',
      'For `UPDATE` / `DELETE` not-found checks, use `RETURNING` and `rows.length === 0` — no result-helper modules or Bun-specific `count` metadata.',
      'Baseline gate still applies: keep modules small, avoid banned patterns, no `oxlint-disable` escapes.',
    ],
  },
  {
    heading: 'Database integration test',
    targetPath: 'tests/<area>.integration.test.ts',
    sourcePath: join(examplesRoot, 'tests/orders.database.integration.test.ts'),
    notes: [
      'Run under `tests/setup/testDatabase.bootstrap.ts` so workers receive `TEST_DATABASE_SHARED_URL`.',
      'Import named DAO operations only — never an `ordersDao` facade.',
      'Do not import `sql`, Bun.sql, or testcontainers from the test file.',
    ],
  },
];

function stripFileBanner(source: string): string {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith('/**')) {
    return source.trimEnd() + '\n';
  }
  const end = trimmed.indexOf('*/');
  if (end === -1) {
    return source.trimEnd() + '\n';
  }
  return `${trimmed
    .slice(end + 2)
    .trimStart()
    .trimEnd()}\n`;
}

function renderSection(section: ExampleSection, source: string): string {
  const notes = section.notes.map((note) => `- ${note}`).join('\n');
  return `## ${section.heading}

Copy to \`${section.targetPath}\`.

${notes}

\`\`\`ts
${stripFileBanner(source).trimEnd()}
\`\`\`
`;
}

export async function buildDatabaseExamplesMarkdown(): Promise<string> {
  const renderedSections: string[] = [];
  for (const section of sections) {
    renderedSections.push(renderSection(section, await file(section.sourcePath).text()));
  }

  const markdown = `# Database preset examples

Agent-facing copy targets for the \`database\` preset. Sources under \`examples/\` are linted and typechecked by the preset pack (baseline + database oxlint rules). Managed runtime files stay in \`payload/\` (\`connection.ts\`, \`migrate.ts\`, \`testDatabase*.ts\`).

After verify in a target project, read this file at \`.aqg/database/database-examples.md\`.

## Rules of thumb

- \`sql\` from \`@/system/database/connection\` is already a lazy Proxy — call it directly in \`*.dao.ts\`.
- Build dynamic filtering and sorting with tagged SQL fragments. Bun SQL \`.unsafe()\` is reserved for managed database infrastructure.
- Define empty-list semantics in the DAO before calling \`sql(values)\` / \`tx(values)\`; return an empty result or no-op for match-none semantics, or omit the clause when empty means no filter.
- Cache/lifecycle side effects belong in helpers such as \`system/database/caches.ts\`, keyed by \`getDatabaseGeneration()\`.
- Outside \`system/database/\`, import only \`closeDatabase\` from connection (app bootstrap / shutdown).
- Integration tests observe production-reachable named DAO functions only.
- Optional DAO reads use \`rows[0] ?? null\`; mapped reads inspect and map the first row inline.
- \`UPDATE\` / \`DELETE\` not-found checks use \`RETURNING\` plus \`rows.length === 0\` — no \`dao-result.ts\` / \`map-first-row.ts\` modules or Bun SQL \`count\` metadata.

${renderedSections.join('\n')}
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');
  return markdown;
}

if (import.meta.main) {
  await buildDatabaseExamplesMarkdown();
  console.log('wrote %s', outputPath);
}

export type ExampleSection = {
  heading: string;
  targetPath: string;
  sourcePath: string;
  notes: readonly string[];
};
