import { join } from 'node:path';

import { readTextFileSync } from 'agent-quality-gate/shared/verify';

export function readRuleFixture(importMetaDir: string, name: string): string {
  return readTextFileSync(join(importMetaDir, 'fixtures', name));
}
