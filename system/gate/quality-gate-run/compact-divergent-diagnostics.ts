import type { Diagnostic } from '../run/check-result.js';

function divergentDetailKey(entry: Diagnostic): string | undefined {
  // Related labels belong to one primary location and must not be detached by compaction.
  if (entry.related !== undefined && entry.related.length > 0) return undefined;
  return JSON.stringify([entry.message]);
}

function appendToGroup(
  groups: Diagnostic[][],
  index: number | undefined,
  entry: Diagnostic,
): boolean {
  if (index === undefined) return false;
  const group = groups[index];
  if (group === undefined) return false;
  group.push(entry);
  return true;
}

export function divergentDetailGroups(
  entries: readonly Diagnostic[],
): readonly (readonly Diagnostic[])[] {
  const groups: Diagnostic[][] = [];
  const indexes = new Map<string, number>();
  for (const entry of entries) {
    const key = divergentDetailKey(entry);
    if (key !== undefined && appendToGroup(groups, indexes.get(key), entry)) continue;
    if (key !== undefined) indexes.set(key, groups.length);
    groups.push([entry]);
  }
  return groups;
}
