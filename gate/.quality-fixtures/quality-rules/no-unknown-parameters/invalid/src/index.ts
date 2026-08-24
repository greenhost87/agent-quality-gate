export function normalize(value: unknown): string {
  return typeof value === 'string' ? value : 'fallback';
}
