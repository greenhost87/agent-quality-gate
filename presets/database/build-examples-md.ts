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
      'Export only named function declarations and types — no classes, default exports, or object bags.',
      'For `DELETE`, use `RETURNING` and treat `rows.length === 0` as not found — do not add `dao-result.ts` helpers or rely on Bun-specific `count` metadata.',
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
- Cache/lifecycle side effects belong in helpers such as \`system/database/caches.ts\`, keyed by \`getDatabaseGeneration()\`.
- Outside \`system/database/\`, import only \`closeDatabase\` from connection (app bootstrap / shutdown).
- Integration tests observe production-reachable named DAO functions only.
- \`DELETE\` in DAOs uses \`RETURNING\` plus \`rows.length === 0\` for not-found — no shared result-helper modules.

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
