import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach } from 'bun:test';

import { getOptionalEnv, setEnv } from '../../gate/read-env/read-env.js';

export function useIsolatedAgentQualityGateHome(): void {
  let home = '';
  let previousHome: string | undefined;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'aqg-home-'));
    previousHome = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    setEnv('AGENT_QUALITY_GATE_HOME', home);
    await mkdir(home, { recursive: true });
  });

  beforeEach(() => {
    // Multiple files register isolated homes; re-bind so tests do not see another file's home.
    setEnv('AGENT_QUALITY_GATE_HOME', home);
  });

  afterAll(async () => {
    setEnv('AGENT_QUALITY_GATE_HOME', previousHome);
    if (home.length > 0) {
      await rm(home, { recursive: true, force: true });
    }
  });
}
