import type { Dict } from './dict.types.js';

export function isPlainObject(value: unknown): value is Dict {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}
