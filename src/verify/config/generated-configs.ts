import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderFallowConfig, renderOxlintConfig } from './policy.js';
import type { readAgentQualityGateConfig } from './agent-quality-gate-config.js';

export function createGeneratedConfigFiles(
  eslintPluginPath: string,
  qualityPluginPath: string,
  projectConfig: ReturnType<typeof readAgentQualityGateConfig>
) {
  const directory = mkdtempSync(join(tmpdir(), 'agent-quality-gate-'));
  const fallow = join(directory, '.fallowrc.json');
  const oxlint = join(directory, '.oxlintrc.json');
  try {
    writeFileSync(fallow, `${JSON.stringify(renderFallowConfig(projectConfig), null, 2)}\n`, 'utf8');
    writeFileSync(
      oxlint,
      `${JSON.stringify(renderOxlintConfig(eslintPluginPath, qualityPluginPath, projectConfig), null, 2)}\n`,
      'utf8'
    );
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return { directory, fallow, oxlint };
}
