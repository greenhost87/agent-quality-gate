import { file } from 'bun';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const presetRoot = import.meta.dir;
const examplesRoot = join(presetRoot, 'examples');
const outputPath = join(presetRoot, 'payload', 'database-examples.md');

const sections: readonly ExampleSection[] = [
  {
    heading: 'DAO module',
    targetPath: 'system/database/<domain>/<name>.dao.ts',
    sourcePath: join(examplesRoot, 'system/database/orders/orders.dao.ts'),
    notes: [
      'Inject `Database` explicitly; import `bun:sqlite` as type-only outside managed infrastructure.',
      '`Database#query` caches prepared statements. Named parameters are checked because the managed connection uses `strict: true`.',
      'Use `Database#transaction` for atomic multi-statement operations.',
    ],
  },
  {
    heading: 'Database integration test',
    targetPath: 'tests/<area>.database.integration.test.ts',
    sourcePath: join(examplesRoot, 'tests/orders.database.integration.test.ts'),
    notes: [
      'Call `useIsolatedTestDatabase` at module scope and obtain the current database only inside tests.',
      'Each test receives a fresh in-memory clone of the migrated template through `serialize` / `deserialize`.',
      'Do not use `test.concurrent`, `describe.concurrent`, or `bun test --concurrent` with the process-global production connection.',
    ],
  },
];

function renderSection(section: ExampleSection, source: string): string {
  const notes = section.notes.map((note) => `- ${note}`).join('\n');
  return `## ${section.heading}

Copy to \`${section.targetPath}\`.

${notes}

\`\`\`ts
${source.trimEnd()}
\`\`\`
`;
}

export async function buildDatabaseSqliteExamplesMarkdown(): Promise<string> {
  const rendered: string[] = [];
  for (const section of sections) {
    rendered.push(renderSection(section, await file(section.sourcePath).text()));
  }

  const markdown = `# database-sqlite preset examples

Agent-facing examples for the \`database-sqlite\` preset. Managed runtime files are installed under \`.aqg/database-sqlite/\`; use the deterministic sync helper instead of inventing copy paths.

## Bun references

- [SQLite runtime documentation](https://bun.com/docs/runtime/sqlite)
- [Bun test lifecycle hooks](https://bun.com/docs/test/lifecycle)

The managed test hook creates one migrated \`:memory:\` template, snapshots it with \`database.serialize()\`, and creates a fresh database before every test with \`Database.deserialize()\`. The official Bun SQLite API documents \`strict\`, prepared statements, transactions, serialization, and explicit close behavior.

${rendered.join('\n')}
`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');
  return markdown;
}

if (import.meta.main) {
  await buildDatabaseSqliteExamplesMarkdown();
  console.log('wrote %s', outputPath);
}

export type ExampleSection = {
  heading: string;
  targetPath: string;
  sourcePath: string;
  notes: readonly string[];
};
