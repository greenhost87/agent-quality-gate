export function maybeObject(value: unknown): boolean {
  return typeof value !== 'object' || value === null;
}

export function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
