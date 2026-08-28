import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll } from 'bun:test';

import { getOptionalEnv, setEnv } from '../../gate/read-env/read-env.js';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const OPTIONAL_PRESET_LINKS = [
  'packages',
  'project-quality',
  'react-presentation',
  'react-duplication',
  'oxlint-ui-surface',
] as const;

export function useIsolatedAgentQualityGateHome(options?: { linkOptionalPresets?: boolean }): void {
  let home = '';
  let previousHome: string | undefined;
  const linkOptionalPresets = options?.linkOptionalPresets === true;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'aqg-home-'));
    previousHome = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    setEnv('AGENT_QUALITY_GATE_HOME', home);
    if (linkOptionalPresets) {
      const presetsDir = join(home, 'presets');
      await mkdir(presetsDir, { recursive: true });
      for (const name of OPTIONAL_PRESET_LINKS) {
        await symlink(resolve(REPO_ROOT, 'presets', name), join(presetsDir, name));
      }
    }
  });

  afterAll(async () => {
    setEnv('AGENT_QUALITY_GATE_HOME', previousHome);
    if (home.length > 0) {
      await rm(home, { recursive: true, force: true });
    }
  });
}
