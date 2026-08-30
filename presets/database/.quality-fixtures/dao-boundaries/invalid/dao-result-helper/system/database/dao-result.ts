export function firstRowOrNull<T>(rows: readonly T[]): T | null {
  return rows[0] ?? null;
}
