import { join } from 'node:path';

import { pathExists, readTextFile } from '../../process/files/files.js';

export function fixturePath(root: string, ...segments: string[]): string {
  return join(root, ...segments);
}

export async function readFixture(root: string, ...segments: string[]): Promise<string> {
  const path = fixturePath(root, ...segments);
  if (!(await pathExists(path))) {
    throw new Error(`fixture not found: ${path}`);
  }
  return readTextFile(path);
}
