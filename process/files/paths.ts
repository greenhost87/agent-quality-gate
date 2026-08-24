import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function canonicalizePath(path: string): string {
  const resolved = resolve(path);
  let existing = resolved;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      return resolved;
    }
    existing = parent;
  }
  try {
    const realExisting = realpathSync(existing);
    const suffix = relative(existing, resolved);
    return suffix.length === 0 ? realExisting : join(realExisting, suffix);
  } catch {
    return resolved;
  }
}

export function pathIsInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

export function selectDeepestRoot<T extends { root: string }>(
  items: readonly T[],
  matches: (item: T) => boolean,
): T | undefined {
  let match: T | undefined;
  for (const item of items) {
    if (!matches(item)) {
      continue;
    }
    if (match === undefined || item.root.length > match.root.length) {
      match = item;
    }
  }
  return match;
}
