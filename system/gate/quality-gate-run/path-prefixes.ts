/**
 * Reversible path-prefix shortening for diagnostic presentation only.
 * Operates on structured path fields; never mutates subject diagnostics.
 */

export type PathPrefixAlias = {
  alias: string;
  prefix: string;
};

export type PathPrefixDictionary = {
  aliases: readonly PathPrefixAlias[];
  /** Instruction + legend lines (without trailing diagnostic body). */
  legend: string;
};

const ALIAS_PREFIX = '@p';

function splitSegments(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function joinSegments(segments: readonly string[], absolute: boolean): string {
  const body = segments.join('/');
  return absolute ? `/${body}` : body;
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

/** Directory prefixes that appear on more than one distinct path (excluding filename). */
export function candidateDirectoryPrefixes(paths: readonly string[]): string[] {
  const prefixCounts = new Map<string, number>();
  const pathSet = [...new Set(paths.filter((path) => path.length > 0))];
  for (const path of pathSet) {
    const absolute = isAbsolutePath(path);
    const segments = splitSegments(path);
    if (segments.length < 2) {
      continue;
    }
    // Exclude filename: prefixes are directory paths only.
    for (let length = 1; length < segments.length; length += 1) {
      const prefix = joinSegments(segments.slice(0, length), absolute);
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }
  return [...prefixCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([prefix]) => prefix)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function applyPrefix(path: string, prefix: string, alias: string): string | undefined {
  if (path === prefix) {
    return undefined;
  }
  const boundary = prefix.endsWith('/') ? prefix : `${prefix}/`;
  if (!path.startsWith(boundary)) {
    return undefined;
  }
  return `${alias}/${path.slice(boundary.length)}`;
}

function legendCost(aliases: readonly PathPrefixAlias[]): number {
  if (aliases.length === 0) {
    return 0;
  }
  const instruction = 'Path prefixes (expand @pN/ before using file tools):';
  const lines = aliases.map((entry) => `${entry.alias} = ${entry.prefix}`);
  return instruction.length + 1 + lines.join('\n').length + 1;
}

function shortenedLength(paths: readonly string[], aliases: readonly PathPrefixAlias[]): number {
  let total = 0;
  for (const path of paths) {
    total += shortenOne(path, aliases).length;
  }
  return total;
}

function shortenOne(path: string, aliases: readonly PathPrefixAlias[]): string {
  // Longest matching prefix wins; aliases are ordered by selection.
  let best: { alias: string; prefix: string; text: string } | undefined;
  for (const entry of aliases) {
    const text = applyPrefix(path, entry.prefix, entry.alias);
    if (text === undefined) {
      continue;
    }
    if (
      best === undefined ||
      entry.prefix.length > best.prefix.length ||
      (entry.prefix.length === best.prefix.length && entry.alias.localeCompare(best.alias) < 0)
    ) {
      best = { alias: entry.alias, prefix: entry.prefix, text };
    }
  }
  return best?.text ?? path;
}

function netGain(paths: readonly string[], aliases: readonly PathPrefixAlias[]): number {
  const original = paths.reduce((sum, path) => sum + path.length, 0);
  const shortened = shortenedLength(paths, aliases);
  return original - shortened - legendCost(aliases);
}

function isBetterPrefixCandidate(
  gain: number,
  prefix: string,
  bestGain: number,
  bestPrefix: string,
): boolean {
  if (gain > bestGain) {
    return true;
  }
  if (gain !== bestGain || gain <= 0) {
    return false;
  }
  return (
    prefix.length > bestPrefix.length ||
    (prefix.length === bestPrefix.length && prefix.localeCompare(bestPrefix) < 0)
  );
}

function scoreBestPrefixCandidate(
  uniquePaths: readonly string[],
  selected: readonly PathPrefixAlias[],
  remaining: readonly string[],
): { bestIndex: number; bestGain: number } {
  let bestIndex = -1;
  const currentGain = netGain(uniquePaths, selected);
  let bestGain = currentGain;
  let bestPrefix = '';
  for (let index = 0; index < remaining.length; index += 1) {
    const prefix = remaining[index];
    if (prefix === undefined) continue;
    const trial: PathPrefixAlias[] = [
      ...selected,
      { alias: `${ALIAS_PREFIX}${String(selected.length + 1)}`, prefix },
    ];
    // Re-number aliases for gain estimate stability.
    const renumbered = trial.map((entry, position) => ({
      alias: `${ALIAS_PREFIX}${String(position + 1)}`,
      prefix: entry.prefix,
    }));
    const gain = netGain(uniquePaths, renumbered);
    if (gain > currentGain && isBetterPrefixCandidate(gain, prefix, bestGain, bestPrefix)) {
      bestGain = gain;
      bestIndex = index;
      bestPrefix = prefix;
    }
  }
  return { bestIndex, bestGain };
}

function selectPathPrefixAliases(uniquePaths: readonly string[]): PathPrefixAlias[] {
  const selected: PathPrefixAlias[] = [];
  const remaining = [...candidateDirectoryPrefixes(uniquePaths)];
  while (remaining.length > 0) {
    const { bestIndex, bestGain } = scoreBestPrefixCandidate(uniquePaths, selected, remaining);
    if (bestIndex < 0 || bestGain <= 0) {
      break;
    }
    const chosen = remaining.splice(bestIndex, 1)[0];
    if (chosen === undefined) break;
    selected.push({
      alias: `${ALIAS_PREFIX}${String(selected.length + 1)}`,
      prefix: chosen,
    });
  }
  return selected;
}

function finalizePathPrefixDictionary(
  uniquePaths: readonly string[],
  selected: readonly PathPrefixAlias[],
): PathPrefixDictionary {
  // Drop unused aliases (no path shortened by them) and re-number.
  const used = selected.filter((entry) =>
    uniquePaths.some((path) => shortenOne(path, selected).startsWith(`${entry.alias}/`)),
  );
  const aliases = used.map((entry, index) => ({
    alias: `${ALIAS_PREFIX}${String(index + 1)}`,
    prefix: entry.prefix,
  }));
  if (aliases.length === 0 || netGain(uniquePaths, aliases) <= 0) {
    return { aliases: [], legend: '' };
  }
  const instruction = 'Path prefixes (expand @pN/ before using file tools):';
  const legend = `${instruction}\n${aliases.map((entry) => `${entry.alias} = ${entry.prefix}`).join('\n')}\n`;
  return { aliases, legend };
}

/**
 * Greedy selection of directory-prefix aliases with positive net character gain.
 * Deterministic tie-break: longer prefix, then lexicographic prefix.
 */
export function buildPathPrefixDictionary(paths: readonly string[]): PathPrefixDictionary {
  const uniquePaths = [...new Set(paths.filter((path) => path.length > 0))];
  if (uniquePaths.some((path) => /^@p\d+(?:\/|$)/u.test(path))) {
    // Ambiguous alias-like real paths: refuse shortening (P7).
    return { aliases: [], legend: '' };
  }
  return finalizePathPrefixDictionary(uniquePaths, selectPathPrefixAliases(uniquePaths));
}

export function shortenPath(path: string, aliases: readonly PathPrefixAlias[]): string {
  return shortenOne(path, aliases);
}

export function expandPath(path: string, aliases: readonly PathPrefixAlias[]): string {
  for (const entry of aliases) {
    const boundary = `${entry.alias}/`;
    if (path.startsWith(boundary)) {
      return `${entry.prefix}/${path.slice(boundary.length)}`;
    }
    if (path === entry.alias) {
      return entry.prefix;
    }
  }
  return path;
}

export function collectDiagnosticPaths(
  diagnostics: readonly {
    location?: { path: string };
    groupLocation?: { path: string };
    related?: readonly { path: string }[];
  }[],
): string[] {
  const paths: string[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.location?.path !== undefined) {
      paths.push(diagnostic.location.path);
    }
    if (diagnostic.groupLocation !== undefined) {
      paths.push(diagnostic.groupLocation.path);
    }
    for (const related of diagnostic.related ?? []) {
      paths.push(related.path);
    }
  }
  return paths;
}
