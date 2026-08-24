import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { agentQualityGateHome } from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';

/** Creates the gate install graph directory required before home preset installation. */
export async function ensureGateInstallNodeModules(home = agentQualityGateHome()): Promise<string> {
  const installModules = join(home, 'install', 'node_modules');
  await mkdir(installModules, { recursive: true });
  return installModules;
}
