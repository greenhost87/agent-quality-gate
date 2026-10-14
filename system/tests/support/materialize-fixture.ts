import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fixturePath } from './fixture-files.js';

export async function materializeFixture(
  fixtureRoot: string,
  prefix: string,
  caseName: string,
  tempDirectories: string[],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}${caseName}-`));
  tempDirectories.push(directory);
  await cp(fixturePath(fixtureRoot, caseName), directory, { recursive: true });
  return directory;
}
