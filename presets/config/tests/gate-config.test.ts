import { describe, expect, it } from 'bun:test';

import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import {
  applyConfiguredRules,
  DEFAULT_ENVIRONMENT_PATH,
  parsePresetConfig,
  resolveManagedFileDestination,
} from 'agent-quality-gate/internal/presets/config/gate-config.ts';

const CUSTOM_ENVIRONMENT_PATH = 'src/server/config/environment.ts';

describe('config preset gate config', () => {
  it('parses a project-relative TypeScript environment path', () => {
    expect(parsePresetConfig({ environmentPath: CUSTOM_ENVIRONMENT_PATH })).toEqual({
      environmentPath: CUSTOM_ENVIRONMENT_PATH,
    });
  });

  it('rejects unsafe and non-TypeScript paths', () => {
    expect(parsePresetConfig({ environmentPath: '/tmp/environment.ts' })).toBeUndefined();
    expect(parsePresetConfig({ environmentPath: '../environment.ts' })).toBeUndefined();
    expect(parsePresetConfig({ environmentPath: 'src\\environment.ts' })).toBeUndefined();
    expect(parsePresetConfig({ environmentPath: 'src/environment.js' })).toBeUndefined();
  });

  it('configures the boundary rule and managed file destination together', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'config/environment-boundaries': { severity: 'error', phase: 'boundaries' },
    };
    const config = { environmentPath: CUSTOM_ENVIRONMENT_PATH };

    applyConfiguredRules(rules, config);

    expect(rules['config/environment-boundaries']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: config,
    });
    expect(resolveManagedFileDestination(DEFAULT_ENVIRONMENT_PATH, config)).toBe(
      CUSTOM_ENVIRONMENT_PATH,
    );
  });
});
