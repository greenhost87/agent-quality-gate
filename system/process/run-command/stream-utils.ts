export function joinStreams(parts: readonly string[]): string {
  const output = parts
    .map((value) => value.trimEnd())
    .filter((value) => value.length > 0)
    .join('\n\n');
  return output.length > 0 ? `${output}\n` : '';
}

export function mergeIgnorePatterns(
  packaged: readonly string[],
  project: readonly string[] = [],
): string[] {
  const merged = [...packaged];
  for (const pattern of project) {
    if (!merged.includes(pattern)) {
      merged.push(pattern);
    }
  }
  return merged;
}
