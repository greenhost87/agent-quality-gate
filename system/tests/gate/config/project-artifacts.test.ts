import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  agentQualityGateHome,
  homeInstalledPresetRoot,
  homePresetsDirectory,
} from '#system/config/agent-quality-gate-home.ts';
import {
  fallowConfigPathForProject,
  oxlintConfigPathForProject,
  verifyFallowConfigPathForProject,
} from '#system/config/project-artifacts.ts';
import { setEnv } from '#system/gate/read-env/read-env.ts';

describe('Agent Quality Gate paths', () => {
  it('uses the home environment override and default', () => {
    const previous = process.env.AGENT_QUALITY_GATE_HOME;
    try {
      setEnv('AGENT_QUALITY_GATE_HOME', '/tmp/aqg-home-override');
      expect(agentQualityGateHome()).toBe('/tmp/aqg-home-override');
      expect(homePresetsDirectory()).toBe('/tmp/aqg-home-override/presets');
      expect(homeInstalledPresetRoot('demo')).toBe('/tmp/aqg-home-override/presets/demo');

      setEnv('AGENT_QUALITY_GATE_HOME', undefined);
      expect(agentQualityGateHome()).toBe(join(homedir(), '.agent-quality-gate'));
    } finally {
      setEnv('AGENT_QUALITY_GATE_HOME', previous);
    }
  });

  it('keeps project artifacts rooted at the resolved project path', () => {
    const projectRoot = '/tmp/aqg-project-artifacts';
    expect(verifyFallowConfigPathForProject(projectRoot)).toBe(
      join(resolve(projectRoot), '.aqg', 'cache', 'fallow', 'verify.json'),
    );
    expect(fallowConfigPathForProject(projectRoot)).toMatch(
      /^\/tmp\/aqg-project-artifacts\/\.aqg\/fallow\/[^/]+\.json$/,
    );
    expect(oxlintConfigPathForProject(projectRoot)).toMatch(
      /^\/tmp\/aqg-project-artifacts\/\.aqg\/oxlint\/[^/]+\.config\.ts$/,
    );
  });
});
