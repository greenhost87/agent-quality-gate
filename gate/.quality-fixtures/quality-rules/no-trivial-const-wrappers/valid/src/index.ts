export const NAMES = ['a', 'b'] as const;

export function withExtra(): string[] {
  return [...NAMES, 'c'];
}

export function literal(): string[] {
  return ['a'];
}

export function fromCall(): string[] {
  return Array.from(NAMES);
}
