/** Env helpers for gate internals (Bun loads `.env` when started as `bun`). */

export function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

export function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = value;
  }
}

export function createEnv(overrides: ProcessEnv): ProcessEnv {
  return { ...process.env, ...overrides };
}

export type ProcessEnv = Record<string, string | undefined>;
