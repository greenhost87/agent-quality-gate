import { expect, test } from 'bun:test';
import { buildDatabaseExamplesMarkdown } from '../../build-examples-md.ts';

test('database examples markdown embeds gated example sources', async () => {
  const markdown = await buildDatabaseExamplesMarkdown();

  expect(markdown).toContain('# Database preset examples');
  expect(markdown).toContain('createDatabaseAccessor');
  expect(markdown).toContain('export async function listOrders');
  expect(markdown).toContain('useIsolatedTestDatabase');
  expect(markdown).toContain('syncCachesToDatabaseGeneration');
});
