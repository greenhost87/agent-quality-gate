const NAMES = ['a', 'b'] as const;

export function listNames(): string[] {
  return [...NAMES];
}
