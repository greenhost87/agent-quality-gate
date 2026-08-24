export function normalize(value: string | null | undefined): string {
  return value ?? 'fallback';
}
