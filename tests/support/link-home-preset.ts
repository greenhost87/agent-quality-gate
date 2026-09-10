import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { symlink } from 'node:fs/promises';

import { getOptionalEnv } from '../../gate/read-env/read-env.js';

/** Install one optional preset into the current isolated AQG home by symlink. */
export async function linkPresetIntoAgentQualityGateHome(
  presetName: string,
  presetRoot: string,
): Promise<void> {
  const home = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
  if (home === undefined || home.length === 0) {
    throw new Error('AGENT_QUALITY_GATE_HOME must be set before linking a preset');
  }
  const presetsDir = join(home, 'presets');
  await mkdir(presetsDir, { recursive: true });
  await symlink(resolve(presetRoot), join(presetsDir, presetName));
}
