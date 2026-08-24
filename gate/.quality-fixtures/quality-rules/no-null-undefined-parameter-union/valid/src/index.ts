export function normalize(value: string | null): string {
  return value ?? 'fallback';
}
