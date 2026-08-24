import type { RoleTurnOptions } from './role.types.js';

export function prompt(options: RoleTurnOptions): string {
  return String(options.timeoutMs);
}
