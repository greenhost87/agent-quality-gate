import { expect, test } from 'bun:test';
import { buildDatabaseExamplesMarkdown } from '../../build-examples-md.ts';

test('database examples markdown embeds gated example sources', async () => {
  const markdown = await buildDatabaseExamplesMarkdown();

  expect(markdown).toContain('# Database preset examples');
  expect(markdown).toContain('createDatabaseAccessor');
  expect(markdown).toContain('export async function listOrders');
  expect(markdown).toContain('export async function deleteOrder');
  expect(markdown).toContain('export async function updateOrderStatus');
  expect(markdown).toContain('export async function searchOrders');
  expect(markdown).toContain('if (ids.length === 0)');
  expect(markdown).toContain('ORDER BY ${orderBy}');
  expect(markdown).toContain('never use `.unsafe()` outside managed database infrastructure');
  expect(markdown).toContain('RETURNING id');
  expect(markdown).not.toContain('readonly count: number');
  expect(markdown).toContain('useIsolatedTestDatabase');
  expect(markdown).toContain('syncCachesToDatabaseGeneration');
});
