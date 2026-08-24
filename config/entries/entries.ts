import { isAbsolute } from 'node:path';

export function invalidProjectRelativeEntries(entries: readonly string[]): string | undefined {
  if (entries.length === 0) {
    return 'entries must be a non-empty string array';
  }
  for (const entry of entries) {
    if (
      entry.length === 0 ||
      isAbsolute(entry) ||
      entry.includes('\\') ||
      entry.split('/').includes('..')
    ) {
      return `entries must contain project-relative globs, received "${entry}"`;
    }
  }
  return undefined;
}
