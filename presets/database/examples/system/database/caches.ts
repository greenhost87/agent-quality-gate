/**
 * Shared database-owned cache helper.
 *
 * When the pool is replaced (`closeDatabase` / URL change), `getDatabaseGeneration()`
 * advances. Call `syncCachesToDatabaseGeneration()` at the start of cached reads so
 * entries from a previous client are dropped.
 *
 * Do not wrap `sql` in accessors (`client.ts`, `createDatabaseAccessor`, `getDatabase`).
 * Only production `*.dao.ts` files may import `sql`.
 */
import { getDatabaseGeneration } from '@/system/database/connection';

const orderListCache = new Map<string, readonly { id: number; status: string }[]>();

let boundGeneration = -1;

/** Drop shared entries when the active SQL client generation changes. */
export function syncCachesToDatabaseGeneration(): void {
  const generation = getDatabaseGeneration();
  if (boundGeneration === generation) {
    return;
  }
  boundGeneration = generation;
  orderListCache.clear();
}

export function readCachedOrderList(
  key: string,
): readonly { id: number; status: string }[] | undefined {
  syncCachesToDatabaseGeneration();
  return orderListCache.get(key);
}

export function writeCachedOrderList(
  key: string,
  value: readonly { id: number; status: string }[],
): void {
  syncCachesToDatabaseGeneration();
  orderListCache.set(key, value);
}

export function invalidateOrderListCache(): void {
  orderListCache.clear();
}
