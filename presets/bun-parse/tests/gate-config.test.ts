import { describe, expect, it } from 'bun:test';

import {
  applyConfiguredRules,
  parsePresetConfig,
} from 'agent-quality-gate/internal/presets/bun-parse/gate-config.ts';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

describe('bun-parse gate config', () => {
  it('configures script directories independently of typeof mode', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'bun-parse/scripts-boundaries': { severity: 'error', phase: 'boundaries' },
      'bun-parse/no-typeof-object': { severity: 'error', phase: 'contracts' },
    };
    const config = { scriptDirectories: ['scripts', 'tools'] };
    expect(parsePresetConfig(config)).toEqual(config);
    applyConfiguredRules(rules, config);
    expect(rules['bun-parse/scripts-boundaries']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: config,
    });
    expect(rules['bun-parse/no-typeof-object']).toEqual({
      severity: 'error',
      phase: 'contracts',
    });
  });
});
