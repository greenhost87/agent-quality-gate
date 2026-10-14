import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fallowExecutablePath } from '#system/gate/run/verify-tool-run.ts';
import { getOptionalEnv, setEnv } from '#system/gate/read-env/read-env.ts';

test.serial(
  'prefers the AQG-home custom Fallow binary and otherwise uses the dependency',
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'aqg-fallow-home-'));
    const previousHome = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
    const previousFallowPath = getOptionalEnv('FALLOW_PATH');
    setEnv('AGENT_QUALITY_GATE_HOME', home);
    setEnv('FALLOW_PATH', undefined);
    try {
      const dependency = fallowExecutablePath();
      expect(dependency.startsWith(home)).toBe(false);

      const override = join(home, 'explicit/bin/fallow');
      setEnv('FALLOW_PATH', override);
      expect(fallowExecutablePath()).toBe(override);
      setEnv('FALLOW_PATH', undefined);

      const custom = join(home, 'fallow-custom/bin/fallow');
      await mkdir(join(home, 'fallow-custom/bin'), { recursive: true });
      await writeFile(custom, '');
      expect(fallowExecutablePath()).toBe(custom);
    } finally {
      setEnv('AGENT_QUALITY_GATE_HOME', previousHome);
      setEnv('FALLOW_PATH', previousFallowPath);
      await rm(home, { recursive: true, force: true });
    }
  },
);
