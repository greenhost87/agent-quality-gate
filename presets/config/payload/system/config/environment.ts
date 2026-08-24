// Managed by agent-quality-gate. Do not edit; changes are overwritten on verify.

/**
 * Keep application-specific names in the project's own system/config/configLoader.ts.
 * Build typed getters from these shared primitives, for example:
 *
 * import * as v from 'valibot';
 * import { getBooleanEnv, getPositiveIntegerEnv, getRequiredEnv, isNodeEnvironment } from './environment.ts';
 *
 * Prefer Valibot schemas for structured config values; use these helpers only for env reads.
 *
 * class ConfigLoaderImpl {
 *   get DATABASE_URL(): string {
 *     return getRequiredEnv('DATABASE_URL');
 *   }
 *
 *   get PAGE_SIZE(): number {
 *     return getPositiveIntegerEnv('PAGE_SIZE') ?? 25;
 *   }
 *
 *   get FEATURE_ENABLED(): boolean {
 *     return getBooleanEnv('FEATURE_ENABLED', true);
 *   }
 *
 *   get isTest(): boolean {
 *     return isNodeEnvironment('test');
 *   }
 * }
 *
 * export const ConfigLoader = new ConfigLoaderImpl();
 *
 * Bun loads `.env` / `.env.local` / `.env.{NODE_ENV}` automatically when the
 * process starts as `bun`. Processes started as `node` need `--env-file`.
 */

export function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

export function getRequiredEnv(key: string): string {
  const value = getOptionalEnv(key);
  if (!value) throw new Error(`${key} env var is required`);
  return value;
}

export function getPositiveIntegerEnv(key: string, required: true): number;
export function getPositiveIntegerEnv(key: string, required?: false): number | undefined;
export function getPositiveIntegerEnv(key: string, required = false): number | undefined {
  const rawValue = getOptionalEnv(key);
  if (!rawValue) {
    if (required) throw new Error(`${key} env var is required`);
    return undefined;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${key} env var value: ${rawValue}`);
  }

  return value;
}

export function getBooleanEnv(key: string, fallback: boolean): boolean {
  const value = getOptionalEnv(key)?.toLowerCase();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid ${key} env var value: ${value}`);
}

export function createEnv(
  overrides: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return { ...process.env, ...overrides };
}

export function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = value;
  }
}

export function isNodeEnvironment(environment: string): boolean {
  return getOptionalEnv('NODE_ENV')?.toLowerCase() === environment.trim().toLowerCase();
}
