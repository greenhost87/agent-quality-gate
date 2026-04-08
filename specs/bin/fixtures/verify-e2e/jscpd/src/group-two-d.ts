export function cloneTwoD(input: string): string {
  const normalized = input.trim().toUpperCase();
  const short = normalized.slice(0, 12);
  const marked = `[two:${short}]`;
  return `${marked}|${normalized.length}`;
}
