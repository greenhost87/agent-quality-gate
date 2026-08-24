import { join } from 'node:path';

import { readTextFileSync } from '../../../../process/files/files.ts';

export function readRuleFixture(importMetaDir: string, name: string): string {
  return readTextFileSync(join(importMetaDir, 'fixtures', name));
}
