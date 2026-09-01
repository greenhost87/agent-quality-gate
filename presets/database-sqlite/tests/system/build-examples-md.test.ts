import { file } from 'bun';
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildDatabaseSqliteExamplesMarkdown } from '../../build-examples-md.ts';

test('builds examples from verified TypeScript sources and official Bun references', async () => {
  const markdown = await buildDatabaseSqliteExamplesMarkdown();
  expect(markdown).toContain('https://bun.com/docs/runtime/sqlite');
  expect(markdown).toContain('https://bun.com/docs/test/lifecycle');
  expect(markdown).toContain('Database.deserialize');
  expect(markdown).toContain('useIsolatedTestDatabase');
  expect(markdown).toContain('database.transaction');
  expect(await file(join(import.meta.dir, '../../payload/database-examples.md')).text()).toBe(
    markdown,
  );
});
