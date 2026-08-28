export function acceptsObject(value: unknown, other: unknown): boolean {
  return (
    !Array.isArray(value) &&
    Object.keys(value as object).length > 0 &&
    null != value &&
    'object' == typeof value &&
    Array.isArray(other)
  );
}
