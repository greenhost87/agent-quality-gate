export function cloneOneB(input: string): string {
  const normalized = input.trim().toLowerCase();
  const short = normalized.slice(0, 16);
  const marked = `[one:${short}]`;
  return `${marked}|${normalized.length}`;
}
