import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function hasBunLockfile(directory: string): boolean {
  return existsSync(join(directory, 'bun.lock')) || existsSync(join(directory, 'bun.lockb'));
}
