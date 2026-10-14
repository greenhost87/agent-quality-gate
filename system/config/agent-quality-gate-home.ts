import { homedir } from 'node:os';
import { join } from 'node:path';

import { getOptionalEnv } from '../gate/read-env/read-env.js';

export function agentQualityGateHome(): string {
  const override = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
  if (override !== undefined) {
    return override;
  }
  return join(homedir(), '.agent-quality-gate');
}

/** Installed optional presets live under `$AGENT_QUALITY_GATE_HOME/presets/<name>/`. */
export function homePresetsDirectory(home = agentQualityGateHome()): string {
  return join(home, 'presets');
}

export function homeInstalledPresetRoot(name: string, home = agentQualityGateHome()): string {
  return join(homePresetsDirectory(home), name);
}
