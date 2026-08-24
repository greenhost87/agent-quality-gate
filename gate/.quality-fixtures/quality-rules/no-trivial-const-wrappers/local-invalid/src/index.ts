const NAMES = ['a'] as const;

function listNames(): string[] {
  return [...NAMES];
}

export function run(): string[] {
  return listNames();
}
